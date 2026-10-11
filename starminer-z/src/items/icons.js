// Inventory icons, rendered once at startup the way the original shows them: small 3D renders
// of tools and guns, and shaded isometric cubes for blocks. With the original's item models
// (ripped into local-assets/items), those are what's drawn, posed and lit as its icon sheet has
// them (InventoryItem.FinishInitialization).

import * as THREE from 'three';
import { ITEMS } from './items.js';
import { itemModel } from './models.js';
import { BLOCKS, TEXTURES } from '../world/blocks.js';
import { paintTexture, TEX_SIZE } from '../gfx/blockTextures.js';
import { heldSpec } from '../entities/cmz/held.js';
import { paint } from '../gfx/propMaterial.js';

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
  if (it.kind === 'tool' && ['compass', 'clock', 'locator', 'teleporter'].includes(it.tool)) return { rot: [0.9, 0, 0], tilt: 0 };
  if (it.kind === 'tool' || it.kind === 'melee' || it.id === 'torch' || it.id === 'stick') return { rot: [0, Math.PI / 2, -Math.PI / 4], tilt: 0 };
  if (it.door) return { rot: [0.15, 0.5, 0], tilt: 0 };
  return { rot: [0.5, 0.6, 0], tilt: 0 };
}

// Renders `obj` (posed already) into a SIZE x SIZE icon, framed on `frame` (a sphere: its centre
// at the middle, and `half` of the icon's width taken by its radius).
class IconCamera {
  constructor(renderer) {
    this.renderer = renderer;
    this.rt = new THREE.WebGLRenderTarget(SIZE * 2, SIZE * 2, { samples: 4 });
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
    this.buf = new Uint8Array(SIZE * 2 * SIZE * 2 * 4);
    this.big = document.createElement('canvas');
    this.big.width = this.big.height = SIZE * 2;
    this.bg = this.big.getContext('2d');
    this.prevClear = renderer.getClearColor(new THREE.Color());
    this.prevAlpha = renderer.getClearAlpha();
  }

  shoot(obj, center, half) {
    const { renderer, rt, scene, cam, buf, bg } = this;
    cam.position.set(center.x, center.y, center.z + 50);
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    scene.add(obj);
    renderer.setRenderTarget(rt);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, SIZE * 2, SIZE * 2, buf);
    scene.remove(obj);
    const img = bg.createImageData(SIZE * 2, SIZE * 2);
    // flip vertically
    for (let y = 0; y < SIZE * 2; y++) img.data.set(buf.subarray((SIZE * 2 - 1 - y) * SIZE * 8, (SIZE * 2 - y) * SIZE * 8), y * SIZE * 8);
    bg.putImageData(img, 0, 0);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const g = canvas.getContext('2d');
    // a soft drop shadow under the item, then the item
    g.filter = 'blur(2px) brightness(0)';
    g.globalAlpha = 0.45;
    g.drawImage(this.big, 2, 3, SIZE, SIZE);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.drawImage(this.big, 0, 0, SIZE, SIZE);
    return canvas.toDataURL();
  }

  done() {
    this.renderer.setRenderTarget(null);
    this.renderer.setClearColor(this.prevClear, this.prevAlpha);
    this.rt.dispose();
  }
}

export function buildIcons(renderer) {
  const shot = new IconCamera(renderer);
  const mat = new THREE.ShaderMaterial({ vertexShader: ICON_VS, fragmentShader: ICON_FS, side: THREE.DoubleSide });
  for (const it of Object.values(ITEMS)) {
    if (it.kind === 'block' && !it.door) { icons.set(it.id, blockIcon(it.block)); continue; }
    const m = itemModel(it.id);
    if (!m) continue;
    const mesh = new THREE.Mesh(m.geo, mat);
    const p = poseFor(it);
    mesh.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
    mesh.updateMatrixWorld();
    // frame it
    const box = new THREE.Box3().setFromObject(mesh);
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
    icons.set(it.id, shot.shoot(mesh, c, Math.max(sz.x, sz.y) * 0.56));
  }
  shot.done();
  mat.dispose();
}

// ---- the original's models -------------------------------------------------------------------

// XNA's CreateFromYawPitchRoll
const ypr = (yaw, pitch, roll) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
// how each kind of thing turns on the original's icon sheet (each class's CreateEntity for the
// UI), and how big it's drawn there: its bounding sphere's radius, in a 64-pixel square
function sheetPose(it) {
  if (it.kind === 'gun' && (it.laser || it.gun === 'lmg')) return [ypr(0, 0, -Math.PI / 4).multiply(ypr(0, -Math.PI / 2, 0)), 32];
  if (it.kind === 'gun') return [ypr(0, 0, -Math.PI / 4), 32];
  if (it.kind === 'melee') return [ypr(0, 0, 0.314159).multiply(ypr(0, -Math.PI / 2, 0)), 35.2];
  if (it.kind === 'tool' && ['compass', 'clock', 'locator', 'teleporter'].includes(it.tool)) return [ypr(0, Math.PI / 2, 0), 22.4];
  if (it.kind === 'tool') return [ypr(0, 0, -Math.PI / 4), 32];
  if (it.kind === 'grenade') return [ypr(0, 0.2, 0).multiply(ypr(-1.5, -1.2, -0.5)), 25.6];
  if (it.door) return [ypr(0, 0, 0), 32];
  if (it.id === 'torch') return [ypr(0, 0, -Math.PI / 4), 32];
  if (it.id === 'gunpowder' || it.id === 'explosive_powder') return [ypr(0, Math.PI / 4, 0), 28.8];
  return [ypr(0, 0, -Math.PI / 4), it.id === 'iron' || it.id === 'copper' || it.id === 'gold' ? 28.8 * 1.5 : 28.8];
}

const SHEET_FS = /* glsl */ `
uniform sampler2D map;
uniform float hasMap;
varying vec3 vN; varying vec3 vC; varying vec2 vM; varying vec2 vUv;
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 n = normalize(vN);
  if (!gl_FrontFacing) n = -n;
  vec3 albedo = toSRGB(vC * mix(vec3(1.0), texture2D(map, vUv).rgb, hasMap));
  // XNA's EnableDefaultLighting: three lights and an ambient, in the colours as they are
  vec3 l = vec3(0.0533, 0.0988, 0.1820);
  l += vec3(1.0, 0.9608, 0.8078) * max(dot(n, normalize(vec3(0.5265, 0.5736, 0.6275))), 0.0);
  l += vec3(0.9647, 0.7608, 0.4078) * max(dot(n, normalize(vec3(-0.7198, -0.3420, -0.6040))), 0.0);
  l += vec3(0.3231, 0.3608, 0.3937) * max(dot(n, normalize(vec3(-0.4545, 0.7660, -0.4545))), 0.0);
  gl_FragColor = vec4(clamp(albedo * l + toSRGB(vC) * vM.y, 0.0, 1.0), 1.0);
}`;
const SHEET_VS = /* glsl */ `
attribute vec3 color;
attribute vec2 aMat;
varying vec3 vN; varying vec3 vC; varying vec2 vM; varying vec2 vUv;
void main() {
  vN = normalize(normalMatrix * normal);
  vC = color; vM = aMat; vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// The icons again, for everything the original has a model of (L: the ripped items).
export function buildCmzIcons(renderer, L) {
  if (!L?.models) return;
  const shot = new IconCamera(renderer);
  const mats = new Map();
  const material = (map) => {
    const key = map ? map.uuid : '';
    if (!mats.has(key)) mats.set(key, new THREE.ShaderMaterial({ vertexShader: SHEET_VS, fragmentShader: SHEET_FS, side: THREE.DoubleSide, uniforms: { map: { value: map || null }, hasMap: { value: map ? 1 : 0 } } }));
    return mats.get(key);
  };
  for (const it of Object.values(ITEMS)) {
    const spec = heldSpec(it.id);
    const name = spec.model || (it.id === 'torch' ? 'torch' : null);
    const M = name && L.models[name];
    if (!M || (it.kind === 'block' && !it.door && it.id !== 'torch')) continue;
    const root = new THREE.Group();
    const m = M.scene.clone(true);
    m.traverse((o) => {
      if (!o.isMesh) return;
      const tint = o.name.includes('recolor2_') ? spec.tint2 ?? 0xffffff : o.name.includes('recolor_') ? spec.tint : spec.shade ?? 0xffffff;
      if (tint === null) { o.visible = false; return; }
      const src = o.material;
      o.geometry = o.name === 'Beam' && spec.beam != null ? paint(o.geometry.clone(), spec.beam, 0, 1) : paint(o.geometry.clone(), tint ?? 0xffffff, 0);
      o.material = material(src.map);
    });
    const [q, r] = sheetPose(it);
    m.quaternion.copy(q);
    root.add(m);
    root.updateMatrixWorld(true);
    const sphere = new THREE.Box3().setFromObject(m).getBoundingSphere(new THREE.Sphere());
    if (!(sphere.radius > 0)) continue;
    icons.set(it.id, shot.shoot(root, sphere.center, sphere.radius * 32 / r));
  }
  shot.done();
  for (const m of mats.values()) m.dispose();
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
