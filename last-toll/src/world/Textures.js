import * as THREE from 'three';
import { mulberry32 } from '../core/rng.js';

// Procedural canvas textures: grime for the static city, ground, water normals.

function canvas(n) {
  const c = document.createElement('canvas');
  c.width = c.height = n;
  return c;
}

let _grime = null;
export function grimeTexture() {
  if (_grime) return _grime;
  const n = 256;
  const c = canvas(n);
  const g = c.getContext('2d');
  const r = mulberry32(99);
  g.fillStyle = '#e6e6e6';
  g.fillRect(0, 0, n, n);
  const img = g.getImageData(0, 0, n, n);
  for (let i = 0; i < n * n; i++) {
    const v = 205 + r() * 50;
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
  }
  g.putImageData(img, 0, 0);
  // stains and streaks
  for (let i = 0; i < 70; i++) {
    const x = r() * n, y = r() * n, rad = 4 + r() * 26;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    const a = 0.05 + r() * 0.12;
    grd.addColorStop(0, `rgba(40,36,28,${a})`);
    grd.addColorStop(1, 'rgba(40,36,28,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 40; i++) {
    const x = r() * n;
    g.fillStyle = `rgba(30,28,22,${0.03 + r() * 0.06})`;
    g.fillRect(x, 0, 1 + r() * 3, n);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  _grime = t;
  return t;
}

export function groundTexture() {
  const n = 512;
  const c = canvas(n);
  const g = c.getContext('2d');
  const r = mulberry32(7);
  g.fillStyle = '#4b4a36';
  g.fillRect(0, 0, n, n);
  for (let i = 0; i < 2600; i++) {
    const x = r() * n, y = r() * n, s = 1 + r() * 6;
    const shade = r();
    g.fillStyle = shade < 0.5 ? `rgba(70,78,44,${0.25 + r() * 0.3})` : shade < 0.8 ? `rgba(58,50,36,${0.25 + r() * 0.3})` : `rgba(96,92,70,${0.2 + r() * 0.2})`;
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 40; i++) {
    const x = r() * n, y = r() * n, rad = 10 + r() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(30,32,24,0.35)');
    grd.addColorStop(1, 'rgba(30,32,24,0)');
    g.fillStyle = grd;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function waterNormalTexture() {
  const n = 128;
  const h = new Float32Array(n * n);
  const r = mulberry32(3);
  // sum of random sine waves (tileable)
  const waves = [];
  for (let i = 0; i < 12; i++) waves.push({ kx: Math.round(r() * 8 - 4), ky: Math.round(r() * 8 - 4), p: r() * 6.28, a: 0.3 + r() });
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let v = 0;
    for (const w of waves) v += w.a * Math.sin(((w.kx * x + w.ky * y) / n) * Math.PI * 2 + w.p);
    h[y * n + x] = v;
  }
  const c = canvas(n);
  const g = c.getContext('2d');
  const img = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const hx = h[y * n + ((x + 1) % n)] - h[y * n + ((x - 1 + n) % n)];
    const hy = h[((y + 1) % n) * n + x] - h[((y - 1 + n) % n) * n + x];
    const nx = -hx * 0.5, ny = -hy * 0.5, nz = 1;
    const l = Math.hypot(nx, ny, nz);
    const i = (y * n + x) * 4;
    img.data[i] = ((nx / l) * 0.5 + 0.5) * 255;
    img.data[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
    img.data[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', n = 64) {
  const c = canvas(n);
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, n, n);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function bloodTexture() {
  const n = 128;
  const c = canvas(n);
  const g = c.getContext('2d');
  const r = mulberry32(5);
  for (let i = 0; i < 18; i++) {
    const a = r() * Math.PI * 2, d = r() * n * 0.28;
    const x = n / 2 + Math.cos(a) * d, y = n / 2 + Math.sin(a) * d;
    const rad = 6 + r() * 22;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(70,6,6,0.95)');
    grd.addColorStop(0.7, 'rgba(60,4,4,0.8)');
    grd.addColorStop(1, 'rgba(50,3,3,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
