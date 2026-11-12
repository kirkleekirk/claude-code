// The sun's shadows: a set of shadow maps centred on what you're looking at,
// each covering a wider square than the last (sharp at your feet, soft but
// present across the valley). Only the first map is drawn every frame; the
// wide ones take turns, since what they cover hardly changes.
import * as THREE from 'three';

// The widest map (a cascade marked `wide`) is for the big things: land,
// buildings, trees as plain lumps. Anything small, or with a cheaper stand-in
// there, is left out of it with this; it still casts in the nearer maps.
export function nearShadowsOnly(mesh) {
  if (mesh.userData.nearShadows) return;
  mesh.userData.nearShadows = true;
  if (mesh.isInstancedMesh) {
    mesh.onBeforeShadow = (r, o, cam, sc) => { o.userData.sc = o.count; if (sc.userData.wide) o.count = 0; };
    mesh.onAfterShadow = (r, o) => { o.count = o.userData.sc; };
  } else {
    mesh.onBeforeShadow = (r, o, cam, sc, geo) => { o.userData.sc = -1; if (sc.userData.wide) { o.userData.sc = geo.drawRange.count; geo.drawRange.count = 0; } };
    mesh.onAfterShadow = (r, o, cam, sc, geo) => { if (o.userData.sc !== -1) geo.drawRange.count = o.userData.sc; };
  }
}
// small props (a car, a bench, a mailbox) anywhere under root
export function smallThingsCastNear(root, radius = 4.5) {
  root.traverse((o) => {
    if (!o.isMesh || !o.castShadow || o.isSkinnedMesh || o.userData.nearShadows || o.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow) return;
    const g = o.geometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    if (g.boundingSphere && g.boundingSphere.radius < radius) nearShadowsOnly(o);
  });
}

const UP = new THREE.Vector3(0, 1, 0);
const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3(), C = new THREE.Vector3();

export class SunShadows {
  constructor(scene, cascades) {
    this.scene = scene;
    this.lights = [];
    this.frame = 0;
    this.all = 3; // frames left in which every map is redrawn
    this.configure(cascades);
  }
  configure(cascades) {
    for (const l of this.lights) { this.scene.remove(l, l.target); l.shadow.dispose(); l.dispose(); }
    this.cascades = cascades;
    this.lights = cascades.map((c, i) => {
      const l = new THREE.DirectionalLight(0xffffff, i === 0 ? 2.5 : 0);
      l.castShadow = true;
      l.shadow.mapSize.set(c.size, c.size);
      l.shadow.autoUpdate = false;
      l.shadow.radius = i === 0 ? 1.4 : 1.1;
      l.shadow.camera.userData.wide = !!c.wide;
      l.name = 'sun' + i;
      this.scene.add(l, l.target);
      return l;
    });
    this.all = 3;
  }
  get sun() { return this.lights[0]; }
  refresh() { this.all = 3; }
  // dir: unit vector toward the light. scale widens every map (the top view looks at far more ground)
  update(focus, dir, scale = 1) {
    this.frame++;
    Z.set(dir.x, Math.max(dir.y, 0.17), dir.z).normalize();
    X.crossVectors(UP, Z).normalize();
    Y.crossVectors(Z, X);
    const n = this.lights.length;
    this.lights.forEach((l, i) => {
      const c = this.cascades[i], r = c.range * scale, cam = l.shadow.camera;
      if (cam.right !== r) { cam.left = -r; cam.right = r; cam.top = r; cam.bottom = -r; cam.near = 1; cam.far = 900; cam.updateProjectionMatrix(); }
      const texel = (2 * r) / c.size;
      // keep the map's texels fixed on the ground as the focus moves
      const cx = Math.round(focus.dot(X) / texel) * texel, cy = Math.round(focus.dot(Y) / texel) * texel, cz = focus.dot(Z);
      C.set(0, 0, 0).addScaledVector(X, cx).addScaledVector(Y, cy).addScaledVector(Z, cz);
      l.target.position.copy(C);
      l.position.copy(C).addScaledVector(Z, 420);
      l.target.updateMatrixWorld();
      l.shadow.bias = -0.00012 - 0.00006 * i;
      l.shadow.normalBias = texel * 1.35 + 0.012;
      // the nearest map every frame; the others in turn
      const period = i === 0 ? 1 : i === 1 ? 2 : 4;
      if (this.all > 0 || this.frame % period === (i * 3) % period) l.shadow.needsUpdate = true;
    });
    if (this.all > 0) this.all--;
    void n;
  }
  setLight(color, intensity) {
    this.lights.forEach((l) => { l.color.copy(color); l.intensity = intensity; });
  }
}
