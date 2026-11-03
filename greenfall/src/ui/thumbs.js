// Offscreen renderer that paints item-shop / locker thumbnails of cosmetics.
import * as THREE from 'three';
import { Character, buildBackBling, buildWeaponModel } from '../game/character.js';
import { makeDirtBike } from '../game/vehicles.js';
import { RARITIES, BY_ID } from '../data/cosmetics.js';

let R = null;
const cache = new Map();
function renderer() {
  if (R) return R;
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setSize(256, 300, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.6));
  const d = new THREE.DirectionalLight(0xffffff, 2.4); d.position.set(2, 3, 4); scene.add(d);
  const rim = new THREE.DirectionalLight(0x9bff57, 1.2); rim.position.set(-3, 2, -3); scene.add(rim);
  const cam = new THREE.PerspectiveCamera(30, 256 / 300, 0.1, 50);
  R = { r, scene, cam, canvas };
  return R;
}
function bgCanvas(rarity) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 300;
  const x = c.getContext('2d');
  const [a, b] = RARITIES[rarity].bg;
  const g = x.createRadialGradient(128, 110, 10, 128, 150, 230);
  g.addColorStop(0, a); g.addColorStop(1, b);
  x.fillStyle = g; x.fillRect(0, 0, 256, 300);
  x.globalAlpha = 0.12; x.fillStyle = '#fff';
  for (let i = -300; i < 300; i += 26) { x.beginPath(); x.moveTo(i, 300); x.lineTo(i + 300, 0); x.lineTo(i + 312, 0); x.lineTo(i + 12, 300); x.fill(); }
  x.globalAlpha = 1;
  return c;
}
export function thumbnail(item, equippedOutfit = null) {
  const key = item.id + (item.type === 'outfit' ? '' : '');
  if (cache.has(key)) return cache.get(key);
  let url = '';
  try {
    const { r, scene, cam, canvas } = renderer();
    const obj = new THREE.Group();
    let target = new THREE.Vector3(0, 1, 0), dist = 4.2;
    if (item.type === 'outfit') {
      const ch = new Character(item.outfit, { shadow: false });
      ch.update(0.016);
      obj.add(ch.root);
      ch.root.rotation.y = 0.35;
      target.set(0, 1.05, 0); dist = 4.6;
    } else if (item.type === 'backbling') {
      const m = buildBackBling(item.style); m.rotation.y = Math.PI + 0.5; obj.add(m); target.set(0, 0, -0.12); dist = 1.6;
    } else if (item.type === 'paint') {
      const m = makeDirtBike(item.paint); m.rotation.y = -0.9; obj.add(m);
    } else if (item.type === 'emote') {
      const base = BY_ID[equippedOutfit || 'farmhand'];
      const ch = new Character(base.outfit, { shadow: false });
      ch.playEmote(item.anim); ch.anim.emoteT = 0.6; ch.update(0.016); ch.anim.emoteT = 0.7; ch.update(0.1);
      obj.add(ch.root); target.set(0, 1.0, 0); dist = 4.8;
    } else if (item.type === 'wrap') {
      const m = buildWeaponModel('m4', 4, item.wrap); m.rotation.y = Math.PI / 2; m.scale.setScalar(2.4); obj.add(m); target.set(0, 0, 0.3); dist = 2.6;
    }
    if (item.type !== 'outfit' && item.type !== 'emote') {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
      target.copy(c);
      dist = Math.max(size.x, size.y * 1.15, size.z) / (2 * Math.tan((cam.fov * Math.PI) / 360)) * 1.35 + size.z * 0.5;
    }
    scene.add(obj);
    scene.background = new THREE.CanvasTexture(bgCanvas(item.rarity));
    scene.background.colorSpace = THREE.SRGBColorSpace;
    cam.position.set(target.x + dist * 0.25, target.y + dist * 0.12, target.z + dist);
    cam.lookAt(target);
    r.render(scene, cam);
    url = canvas.toDataURL('image/png');
    scene.remove(obj);
    scene.background.dispose();
  } catch (e) {
    console.warn('thumbnail failed', e);
    url = bgCanvas(item.rarity).toDataURL();
  }
  cache.set(key, url);
  return url;
}

// side view of a gun with its mods, for the workbench (transparent background)
const gunCache = new Map();
export function gunThumb(id, kind, rarity, mods, w = 360, h = 170) {
  const key = id + '|' + rarity + '|' + Object.entries(mods || {}).sort().join(',');
  if (gunCache.has(key)) return gunCache.get(key);
  let url = '';
  const { r, scene, cam, canvas } = renderer();
  try {
    r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
    const m = buildWeaponModel(kind, rarity, null, mods);
    m.rotation.y = Math.PI / 2;
    const obj = new THREE.Group(); obj.add(m);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const dist = Math.max(size.x / cam.aspect, size.y) / (2 * Math.tan((cam.fov * Math.PI) / 360)) * 1.18 + size.z;
    scene.add(obj);
    scene.background = null;
    cam.position.set(c.x + dist * 0.06, c.y + dist * 0.18, c.z + dist);
    cam.lookAt(c);
    r.setClearColor(0x000000, 0);
    r.render(scene, cam);
    url = canvas.toDataURL('image/png');
    scene.remove(obj);
  } catch (e) { console.warn('gun thumbnail failed', e); }
  r.setSize(256, 300, false); cam.aspect = 256 / 300; cam.updateProjectionMatrix();
  if (gunCache.size > 60) gunCache.clear();
  gunCache.set(key, url);
  return url;
}

// Slowly turning 3D preview (item detail view): renders into the shared offscreen renderer
// and copies each frame into a visible 2D canvas. Emotes play their animation. Stops by
// itself when the canvas leaves the page.
export function turntable(item, canvas, equippedOutfit = null) {
  const { r, scene, cam, canvas: src } = renderer();
  const W = 256, H = 300;
  const obj = new THREE.Group();
  let ch = null, target = new THREE.Vector3(0, 1.05, 0), dist = 4.6;
  if (item.type === 'outfit' || item.type === 'emote' || item.type === 'backbling') {
    const outfit = item.type === 'outfit' ? item.outfit : BY_ID[equippedOutfit || 'farmhand'].outfit;
    ch = new Character(outfit, { shadow: false });
    if (item.type === 'backbling') ch.setBackBling(item.style);
    if (item.type === 'emote') ch.playEmote(item.anim);
    obj.add(ch.root);
  } else {
    const m = item.type === 'paint' ? makeDirtBike(item.paint) : buildWeaponModel('m4', 4, item.wrap);
    if (item.type === 'wrap') m.scale.setScalar(2.4);
    obj.add(m);
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3());
    target = box.getCenter(new THREE.Vector3());
    dist = Math.max(size.x, size.y, size.z) / (2 * Math.tan((cam.fov * Math.PI) / 360)) * 1.4;
  }
  const bg = new THREE.CanvasTexture(bgCanvas(item.rarity)); bg.colorSpace = THREE.SRGBColorSpace;
  const ctx = canvas.getContext('2d');
  canvas.width = W; canvas.height = H;
  let last = performance.now(), a = item.type === 'backbling' ? Math.PI : 0.3;
  const frame = (t) => {
    if (!canvas.isConnected) { bg.dispose(); ch?.dispose?.(); return; }
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    a += dt * 0.7;
    obj.rotation.y = a;
    if (ch) { if (item.type === 'emote' && !ch.anim.emote) ch.playEmote(item.anim); ch.update(dt); }
    r.setSize(W, H, false); cam.aspect = W / H; cam.updateProjectionMatrix();
    scene.add(obj); scene.background = bg;
    cam.position.set(target.x, target.y + dist * 0.12, target.z + dist); cam.lookAt(target);
    r.render(scene, cam);
    scene.remove(obj); scene.background = null;
    ctx.clearRect(0, 0, W, H); ctx.drawImage(src, 0, 0, W, H);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}
