import * as THREE from 'three';
import { Gfx } from './gfx/renderer.js';
import { G } from './gfx/globals.js';
import { bakeNoiseTexture } from './gfx/textures.js';
import { Sky } from './gfx/sky.js';
import { Water } from './gfx/water.js';
import { Terrain } from './world/terrain.js';
import { generateWorld } from './world/gen.js';
import { PLANETS } from './world/planets.js';
import { Flora } from './world/flora.js';
import { Colliders } from './core/colliders.js';

async function boot() {
  const canvas = document.getElementById('view');
  const params = new URLSearchParams(location.search);
  const gfx = new Gfx(canvas, params.get('q') || 'high');
  G.uNoise.value = bakeNoiseTexture(256);
  G.uNoise.value.anisotropy = Math.min(8, gfx.maxAniso);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, gfx.aspect, 0.3, 9000);
  const sky = new Sky();
  scene.add(sky.mesh);
  const water = new Water(gfx);
  scene.add(water.mesh);

  const FS = (window.FS = { gfx, scene, camera, sky, water, ready: false, manual: false });
  let terrain = null;

  FS.load = async (id) => {
    const def = PLANETS[id];
    const data = await generateWorld(def);
    if (terrain) { scene.remove(terrain.group); terrain.dispose(); }
    if (FS.flora) { scene.remove(FS.flora.group); FS.flora.dispose(); }
    terrain = new Terrain(gfx, data);
    FS.terrain = terrain;
    scene.add(terrain.group);
    terrain.activate();
    water.setWorld(terrain, def);
    sky.setPlanet(def.sky);
    sky.time = def.sky.startTime;
    FS.def = def;
    FS.colliders = new Colliders();
    const t0 = performance.now();
    FS.flora = new Flora(gfx, terrain, def, FS.colliders);
    scene.add(FS.flora.group);
    console.log('flora', FS.flora.instanceCount, 'instances', FS.flora.meshes.length, 'meshes', (performance.now() - t0) | 0, 'ms');
  };
  FS.view = (x, y, z, yaw, pitch, fov) => {
    const gy = terrain.heightAt(x, z);
    camera.position.set(x, y < 0 ? gy - y : y, z);
    camera.rotation.set(0, 0, 0);
    camera.rotation.order = 'YXZ';
    camera.rotation.y = (yaw * Math.PI) / 180;
    camera.rotation.x = (pitch * Math.PI) / 180;
    if (fov) camera.fov = fov;
    FS.warm = true;
  };
  FS.step = (dt = 1 / 60) => {
    gfx.resize();
    camera.aspect = gfx.aspect;
    camera.updateProjectionMatrix();
    G.uTime.value += dt;
    sky.update(dt, FS.freeze);
    terrain.update(camera.position, gfx.q.drawDist);
    if (FS.warm) { FS.flora.warm(camera.position); FS.warm = false; }
    FS.flora.update(camera.position, camera.position);
    G.uNight.value = sky.night;
    terrain.bakeShadow(sky.keyDir);
    camera.updateMatrixWorld();
    sky.follow(camera);
    water.follow(camera);
    gfx.mFinal.uniforms.uExposure.value = sky.exposure;
    gfx.render(scene, camera, {
      seaY: FS.def.hasWater && !FS.def.lava ? FS.def.sea : undefined,
      sunDir: sky.sunDir, rayStrength: Math.max(0, 1 - sky.night) * 0.55,
    });
  };

  await FS.load(params.get('planet') || 'veyra');
  FS.view(0, -3, 230, 0, 4);
  FS.ready = true;
  let last = performance.now();
  const loop = (now) => {
    requestAnimationFrame(loop);
    if (FS.manual) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    FS.step(dt);
  };
  requestAnimationFrame(loop);
}

boot().catch((e) => {
  console.error(e);
  const d = document.createElement('pre');
  d.style.cssText = 'position:fixed;inset:0;color:#f88;padding:20px;white-space:pre-wrap;font:12px monospace;z-index:99';
  d.textContent = 'Boot error: ' + (e && e.stack ? e.stack : e);
  document.body.appendChild(d);
});
