import * as THREE from 'three';
import { Environment } from '../world/Environment.js';
import { Batcher } from '../world/Batcher.js';
import { grimeTexture } from '../world/Textures.js';

// The Magnolia: a beached paddle steamer that serves as home base.
// Rendered behind the hub menus with a slow drifting camera.

export class HubScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 800);
    this.env = new Environment(this.scene, { towerDir: new THREE.Vector3(0.6, 0, -1), shadows: true });
    this.env.setTime(19.15);
    this.env.water.position.y = -0.6;
    const b = new Batcher();
    const wood = 0x5f4632, woodL = 0x7a5c40, white = 0xc9c2b0, trim = 0x8a3a2a;
    // hull and deck
    b.box(0, -0.35, 0, 9, 1.2, 24, 0x2c2f2a, { ao: 1 });
    for (let z = -11.5; z < 12; z += 0.5) b.box(0, 0.3, z + 0.25, 8.6, 0.1, 0.46, woodL, { jitter: 0.08, ao: 1 });
    // railings
    for (const s of [-1, 1]) {
      b.box(s * 4.3, 1.1, 0, 0.08, 0.08, 23.5, white);
      b.box(s * 4.3, 0.7, 0, 0.05, 0.05, 23.5, white);
      for (let z = -11.5; z <= 11.5; z += 1.2) b.box(s * 4.3, 0.7, z, 0.06, 0.8, 0.06, white);
    }
    // cabin with lit windows
    b.box(0, 1.9, 5.5, 6.4, 3.2, 8, white, { ao: 0.8 });
    b.box(0, 3.6, 5.5, 7.2, 0.25, 9, trim, { ao: 1 });
    b.box(0, 4.9, 6.5, 4, 2.4, 4, white, { ao: 0.8 });
    b.box(0, 6.2, 6.5, 4.6, 0.2, 4.6, trim);
    for (const s of [-1, 1]) {
      b.cylinder(s * 1.3, 8.5, 8.3, 0.35, 0.4, 6.5, 0x1e1e1e, 10);
      b.box(s * 1.3, 11.9, 8.3, 1.0, 0.25, 1.0, 0x1e1e1e);
    }
    // paddle wheel
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      b.box(0, 1.2 + Math.sin(a) * 2.2, 12.8 + Math.cos(a) * 2.2, 7.6, 0.1, 0.5, trim, { rotY: 0 });
    }
    b.cylinder(0, 1.2, 12.8, 0.3, 0.3, 7.8, 0x2a2a2a, 8, { rz: Math.PI / 2 });
    // workbench, crates, barrels
    b.box(-2.6, 0.85, -3, 2.6, 0.12, 1.0, woodL);
    for (const [x, z] of [[-3.8, -3.4], [-1.4, -3.4], [-3.8, -2.6], [-1.4, -2.6]]) b.box(x, 0.55, z, 0.1, 0.5, 0.1, wood);
    b.box(-3.2, 1.0, -3.1, 0.5, 0.18, 0.3, 0x8a2a1e);
    b.box(-2.2, 0.98, -2.9, 0.7, 0.1, 0.4, 0x6a6a6a, { rotY: 0.3 });
    b.box(-3.3, 1.45, -3.45, 1.4, 1.0, 0.06, wood);
    for (let i = 0; i < 6; i++) b.box(-3.9 + i * 0.25, 1.5, -3.4, 0.04, 0.4 + (i % 3) * 0.1, 0.04, 0x9a9ea3);
    for (const [x, z, s] of [[3.2, -8, 0.9], [2.6, -9.2, 0.8], [3.4, -9.4, 0.7], [-3.4, 1.2, 0.8]]) b.box(x, 0.35 + s / 2, z, s, s, s, woodL, { rotY: x * 0.3 });
    b.cylinder(2.8, 0.8, -1.5, 0.3, 0.3, 0.9, 0x3a2a1e, 8);
    b.cylinder(-3.6, 0.8, -7, 0.3, 0.3, 0.9, 0x3a4a5a, 8);
    // stove + pot
    b.box(2.9, 0.85, 1.4, 1.0, 1.0, 0.8, 0x2a2a2a);
    b.cylinder(2.9, 1.5, 1.4, 0.25, 0.22, 0.3, 0x4a4a48, 10);
    // hammock line and sacks
    b.box(-3.4, 1.4, -6, 0.06, 2.2, 0.06, wood);
    b.box(-3.4, 1.4, -9.5, 0.06, 2.2, 0.06, wood);
    b.box(-3.4, 0.9, -7.75, 0.5, 0.08, 3.2, 0x7a6f5a);
    b.box(1.5, 0.45, -10.5, 1.2, 0.3, 0.8, 0x8a7a5a, { rotY: 0.4 });
    // drowned town on the far bank
    for (let i = 0; i < 30; i++) {
      const x = -60 + i * 4.5 + Math.random() * 3, z = -45 - Math.random() * 25;
      const h = 2 + Math.random() * 6;
      b.box(x, h / 2 - 0.5, z, 3 + Math.random() * 3, h, 4, [0x5a6a64, 0x6a5a4a, 0x4a4a52, 0x5a5048][i % 4], { ao: 0.5 });
    }
    for (let i = 0; i < 16; i++) {
      const x = -40 + Math.random() * 80, z = 20 + Math.random() * 40;
      b.cone(x, 4 + Math.random() * 3, z, 1.5 + Math.random(), 8 + Math.random() * 5, 0x243020);
    }
    this.boat = b.build(new THREE.MeshLambertMaterial({ vertexColors: true, map: grimeTexture() }));
    this.boat.matrixAutoUpdate = true;
    this.scene.add(this.boat);

    // lit windows
    const winMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    for (const [x, z] of [[-3.21, 3.5], [-3.21, 6.5], [3.21, 3.5], [3.21, 6.5]]) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.8), winMat);
      w.position.set(x, 2.1, z);
      w.rotation.y = x < 0 ? -Math.PI / 2 : Math.PI / 2;
      this.scene.add(w);
    }
    const front = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2), new THREE.MeshBasicMaterial({ color: 0xd8904a }));
    front.position.set(0, 1.3, 1.49);
    front.rotation.y = Math.PI;
    this.scene.add(front);

    // lights
    this.lantern = new THREE.PointLight(0xffb060, 14, 14, 1.4);
    this.lantern.position.set(-2.5, 2.4, -2.6);
    this.scene.add(this.lantern);
    this.stoveLight = new THREE.PointLight(0xff7a30, 8, 8, 1.6);
    this.stoveLight.position.set(2.9, 1.3, 0.9);
    this.scene.add(this.stoveLight);
    const cabin = new THREE.PointLight(0xffc070, 10, 12, 1.5);
    cabin.position.set(0, 2.2, 1.0);
    this.scene.add(cabin);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
    bulb.position.copy(this.lantern.position);
    this.scene.add(bulb);

    this.t = 0;
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    const t = this.t;
    const a = -0.9 + Math.sin(t * 0.05) * 0.35;
    const r = 13;
    this.camera.position.set(Math.sin(a) * r - 1, 4.2 + Math.sin(t * 0.4) * 0.08, -Math.cos(a) * r * 0.9 - 6);
    this.camera.lookAt(-1.2, 1.6, -1.5);
    this.camera.rotation.z += Math.sin(t * 0.6) * 0.004;
    this.boat.rotation.z = Math.sin(t * 0.5) * 0.004;
    this.lantern.intensity = 14 * (0.9 + Math.sin(t * 9) * 0.05 + Math.random() * 0.05);
    this.stoveLight.intensity = 8 * (0.8 + Math.random() * 0.25);
    this.env.update(dt, this.camera.position, t);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }
}
