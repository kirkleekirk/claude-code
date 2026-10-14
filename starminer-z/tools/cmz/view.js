// The enemies tools/cmz/rip_models.py exported, side by side, posed at one moment of a clip:
//   npm run dev, then /tools/cmz/view.html?clip=walk&t=0.4   (t: 0..1 through the clip)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const q = new URLSearchParams(location.search);
const clipName = q.get('clip') || 'walk';
const at = parseFloat(q.get('t') || '0.3');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343a);
const cam = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.05, 100);
cam.position.set(0, parseFloat(q.get('camY') || '1.3'), parseFloat(q.get('camZ') || '8'));
cam.lookAt(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 5, 4);
scene.add(sun);
scene.add(new THREE.GridHelper(20, 20, 0x9a9a9a, 0x555555));

const base = '/local-assets/models/';
const index = await (await fetch(base + 'index.json')).json();
const loader = new GLTFLoader();
const tex = new THREE.TextureLoader();
const SKIN = { zombie: 'zombie-01.png', skeleton: 'skele-01.png', skeleton_axes: 'skele-04.png', skeleton_sword: 'skele-05.png', skeleton_archer: 'skele-06.png' };
const names = Object.keys(index.models);
const loaded = {};
for (const name of names) loaded[name] = await loader.loadAsync(base + index.models[name].file);
const report = [];
names.forEach((name, i) => {
  const g = loaded[name];
  const root = g.scene;
  root.position.x = (i - (names.length - 1) / 2) * 1.7;
  root.rotation.y = q.has('back') ? 0 : Math.PI; // the models face -z, as XNA's do
  const map = tex.load(base + SKIN[name]);
  map.flipY = false;
  map.colorSpace = THREE.SRGBColorSpace;
  root.traverse((o) => { if (o.isMesh) { o.material.map = map; o.material.needsUpdate = true; o.frustumCulled = false; } });
  scene.add(root);
  const clips = loaded[index.models[name].clipsFrom].animations;
  const clip = THREE.AnimationClip.findByName(clips, clipName) || clips[0];
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).play();
  mixer.setTime(at * clip.duration);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root, true);
  report.push(`${name}: clip ${clip.name} ${clip.duration.toFixed(2)} s, box y ${box.min.y.toFixed(2)}..${box.max.y.toFixed(2)} z ${box.min.z.toFixed(2)}..${box.max.z.toFixed(2)}`);
});
console.warn(report.join('\n'));
renderer.render(scene, cam);
setTimeout(() => { renderer.render(scene, cam); window.__shotReady = true; }, 500);
