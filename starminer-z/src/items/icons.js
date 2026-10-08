// Inventory icons, rendered once at startup the way the original shows them: small 3D renders
// of tools and guns, and shaded isometric cubes for blocks.

import * as THREE from 'three';
import { ITEMS } from './items.js';
import { itemModel } from './models.js';
import { BLOCKS, TEXTURES } from '../world/blocks.js';
import { paintTexture, TEX_SIZE } from '../gfx/blockTextures.js';

const SIZE = 96;
const icons = new Map();

const ICON_VS = /* glsl */ `
attribute vec3 color;
attribute vec2 aMat;
varying vec3 vN; varying vec3 vC; varying vec2 vM; varying vec3 vV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vC = color; vM = aMat; vV = -mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;
const ICON_FS = /* glsl */ `
varying vec3 vN; varying vec3 vC; varying vec2 vM; varying vec3 vV;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 v = normalize(vV);
  vec3 L = normalize(vec3(-0.4, 0.8, 0.6));
  float d = max(dot(n, L), 0.0);
  float metal = vM.x;
  vec3 col = vC * (0.32 + 0.9 * d) * (1.0 - metal * 0.35);
  vec3 h = normalize(L + v);
  col += mix(vec3(0.04), vC, metal) * pow(max(dot(n, h), 0.0), mix(20.0, 70.0, metal)) * (0.4 + metal * 1.4);
  // a cool rim light, like the sky behind
  col += vec3(0.25, 0.4, 0.6) * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.5;
  col += vC * vM.y * 1.5;
  gl_FragColor = vec4(toSRGB(clamp(col, 0.0, 1.0)), 1.0);
}`;

// how each kind of item is posed in its icon
function poseFor(it) {
  if (it.kind === 'gun') return { rot: [0, Math.PI / 2, 0], tilt: 0.22 };
  if (it.kind === 'tool' && it.tool === 'compass') return { rot: [0.9, 0, 0], tilt: 0 };
  if (it.kind === 'tool' || it.kind === 'melee' || it.id === 'torch' || it.id === 'stick') return { rot: [0, Math.PI / 2, -Math.PI / 4], tilt: 0 };
  return { rot: [0.5, 0.6, 0], tilt: 0 };
}

export function buildIcons(renderer) {
  const rt = new THREE.WebGLRenderTarget(SIZE * 2, SIZE * 2, { samples: 4 });
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
  cam.position.set(0, 0, 5);
  const mat = new THREE.ShaderMaterial({ vertexShader: ICON_VS, fragmentShader: ICON_FS, side: THREE.DoubleSide });
  const buf = new Uint8Array(SIZE * 2 * SIZE * 2 * 4);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  const big = document.createElement('canvas');
  big.width = big.height = SIZE * 2;
  const bg = big.getContext('2d');
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  for (const it of Object.values(ITEMS)) {
    if (it.kind === 'block') { icons.set(it.id, blockIcon(it.block)); continue; }
    const m = itemModel(it.id);
    if (!m) continue;
    const mesh = new THREE.Mesh(m.geo, mat);
    const p = poseFor(it);
    mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    mesh.updateMatrixWorld();
    // frame it
    const box = new THREE.Box3().setFromObject(mesh);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    mesh.position.sub(c);
    const half = Math.max(sz.x, sz.y) * 0.56;
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    scene.add(mesh);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE * 2, SIZE * 2, buf);
    scene.remove(mesh);
    const img = bg.createImageData(SIZE * 2, SIZE * 2);
    // flip vertically
    for (let y = 0; y < SIZE * 2; y++) img.data.set(buf.subarray((SIZE * 2 - 1 - y) * SIZE * 8, (SIZE * 2 - y) * SIZE * 8), y * SIZE * 8);
    bg.putImageData(img, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);
    // a soft drop shadow under the item, then the item
    g.filter = 'blur(2px) brightness(0)';
    g.globalAlpha = 0.45;
    g.drawImage(big, 2, 3, SIZE, SIZE);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.drawImage(big, 0, 0, SIZE, SIZE);
    icons.set(it.id, canvas.toDataURL());
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(prevClear, prevAlpha);
  rt.dispose();
  mat.dispose();
}

// An isometric cube from the block's own textures: lit top, shaded sides.
function blockIcon(id) {
  const def = BLOCKS[id];
  const S = SIZE;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const face = (layer) => {
    const t = document.createElement('canvas');
    t.width = t.height = TEX_SIZE;
    const tg = t.getContext('2d');
    const img = tg.createImageData(TEX_SIZE, TEX_SIZE);
    const data = paintTexture(TEXTURES[layer]);
    if (def.render !== 'cutout' && def.render !== 'torch') for (let i = 3; i < data.length; i += 4) data[i] = 255;
    img.data.set(data);
    tg.putImageData(img, 0, 0);
    return t;
  };
  if (def.render === 'torch') {
    g.imageSmoothingEnabled = false;
    g.drawImage(face(def.faces[0]), 0, 0, S, S);
    return c.toDataURL();
  }
  const top = face(def.faces[2]), side = face(def.faces[0]);
  const s = S * 0.31, cx = S / 2, cy = S * 0.29;
  g.imageSmoothingEnabled = true;
  // top
  g.save();
  g.setTransform(s / TEX_SIZE, s / TEX_SIZE * 0.5, -s / TEX_SIZE, s / TEX_SIZE * 0.5, cx, cy - s * 0.5 + 2);
  g.drawImage(top, 0, 0);
  g.restore();
  // left side
  g.save();
  g.setTransform(s / TEX_SIZE, s / TEX_SIZE * 0.5, 0, s / TEX_SIZE * 1.0, cx - s, cy + 2);
  g.drawImage(side, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  g.restore();
  // right side
  g.save();
  g.setTransform(s / TEX_SIZE, -s / TEX_SIZE * 0.5, 0, s / TEX_SIZE * 1.0, cx, cy + s * 0.5 + 2);
  g.drawImage(side, 0, 0);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
  g.restore();
  return c.toDataURL();
}

export function iconFor(id) {
  return icons.get(id) || '';
}
