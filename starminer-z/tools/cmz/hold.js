// The player's avatar posed by the original's clips with something in hand (from the files
// tools/cmz/rip_player.py exported), seen from the front, the side, above and its own eyes:
//   npm run dev, then /tools/cmz/hold.html?item=pistol&t=0.5&fps=1   (t: seconds into the clips;
//   ads=1 aims, use=1 swings or fires at the start)
import * as THREE from 'three';
import { loadAvatarAssets } from '../../src/entities/avatar/assets.js';
import { AvatarModel, bindPosition } from '../../src/entities/avatar/model.js';
import { loadCmzClips } from '../../src/entities/cmz/avatarAnim.js';
import { CmzPlayerAnimation } from '../../src/entities/cmz/playerAnim.js';
import { loadCmzItems, HeldItems } from '../../src/entities/cmz/held.js';

const q = new URLSearchParams(location.search);
const item = q.get('item') || 'pistol';
const T = parseFloat(q.get('t') || '0.5');
const fps = q.get('fps') !== '0';
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setScissorTest(true);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x30343a);
scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(3, 5, 4);
scene.add(sun);
scene.add(new THREE.GridHelper(4, 16, 0x9a9a9a, 0x555555));
scene.add(new THREE.AxesHelper(0.5));

await loadAvatarAssets();
const [clips, items] = await Promise.all([loadCmzClips(), loadCmzItems()]);
const model = new AvatarModel({}, {}, {});
model.root.scale.setScalar(1);
model.mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
model.mesh.frustumCulled = false;
scene.add(model.root);
const held = new HeldItems(items, {}, {}).make(item);
held.obj.traverse((o) => { if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ map: o.material.uniforms?.uMap?.value ?? null, vertexColors: true, side: THREE.DoubleSide, roughness: 0.6 }); });
model.byName.RT_PROP__Skeleton.add(held.obj);
model.byName.RT_PROP__Skeleton.add(new THREE.AxesHelper(0.12));
const anim = new CmzPlayerAnimation(clips, clips.bonesOf(model.byName), bindPosition('BASE__Skeleton'), fps);
anim.setMode(held.spec.mode);
const step = 1 / 60;
for (let t = 0; t < T; t += step) {
  anim.update(step, { use: q.has('use') && t === 0, shoulder: q.has('ads'), reload: q.has('reload'), reloadTime: 1.5, move: parseFloat(q.get('move') || '0'), back: false, pitch: 0, dead: false });
}
if (fps) model.byName.HEAD__Skeleton.scale.setScalar(0.001);
model.root.updateMatrixWorld(true);

// the eye, as the first-person view places it
const head = model.byName.HEAD__Skeleton;
const x = new THREE.Vector3(), y = new THREE.Vector3(), z = new THREE.Vector3(), p = new THREE.Vector3();
head.matrixWorld.extractBasis(x, y, z);
p.setFromMatrixPosition(head.matrixWorld);
const eye = new THREE.Matrix4().makeBasis(x.normalize(), y.normalize(), z.normalize()).setPosition(p)
  .multiply(new THREE.Matrix4().makeTranslation(0, 0.045, 0)).multiply(new THREE.Matrix4().makeRotationY(Math.PI));
const eyeCam = new THREE.PerspectiveCamera(q.has('ads') ? 45 : 90, 1, 0.01, 20);
eye.decompose(eyeCam.position, eyeCam.quaternion, eyeCam.scale);

const views = [
  ['front', [0, 1.1, 2.6], [0, 1.0, 0]],
  ['right side', [-2.6, 1.1, 0.3], [0, 1.0, 0.3]],
  ['above', [0, 3.2, 0.6], [0, 1.0, 0.35]],
];
const W = innerWidth / 2, H = innerHeight / 2;
const cams = views.map(([, pos, at]) => { const c = new THREE.PerspectiveCamera(32, W / H, 0.02, 50); c.position.set(...pos); c.lookAt(...at); return c; });
cams.push(eyeCam);
eyeCam.aspect = W / H;
eyeCam.updateProjectionMatrix();
const draw = () => {
  cams.forEach((c, i) => {
    const vx = (i % 2) * W, vy = (1 - Math.floor(i / 2)) * H;
    renderer.setViewport(vx, vy, W, H);
    renderer.setScissor(vx, vy, W, H);
    renderer.render(scene, c);
  });
};
draw();
const prop = new THREE.Vector3().setFromMatrixPosition(model.byName.RT_PROP__Skeleton.matrixWorld);
const wrist = new THREE.Vector3().setFromMatrixPosition(model.byName.RT_W__Skeleton.matrixWorld);
document.getElementById('info').textContent = `${item}: mode ${held.spec.mode}, clip ${anim.anim.at(2)?.name} ${anim.anim.at(3)?.name ?? ''}\nwrist ${wrist.toArray().map((v) => v.toFixed(3))} prop ${prop.toArray().map((v) => v.toFixed(3))}\neye ${eyeCam.position.toArray().map((v) => v.toFixed(3))}\nviews: front | right side / above | eyes`;
setTimeout(() => { draw(); window.__shotReady = true; }, 300);
