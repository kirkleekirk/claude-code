import * as THREE from 'three';
import { waterNormalTexture } from './Textures.js';
import { lerp, clamp } from '../core/math.js';

// Sky, fog, sun/moon, water, and the bell tower on the horizon.
// Time is in hours (17.0 = 5 PM). Dusk falls over the raid until the Toll.

const KEYS = [
  { h: 16.0, top: 0x6f8aa0, hor: 0xd4c6a2, fog: 0x9a9888, near: 22, far: 130, sun: 0xffe2b8, sunI: 2.4, hs: 0xb4c2d0, hg: 0x4a4a3a, hi: 1.84, elev: 32, dark: 0 },
  { h: 17.5, top: 0x56688a, hor: 0xdcae7a, fog: 0x9a8a74, near: 20, far: 115, sun: 0xffc88a, sunI: 2.0, hs: 0xa0a8b8, hg: 0x44402e, hi: 1.6, elev: 18, dark: 0.08 },
  { h: 18.6, top: 0x323a5c, hor: 0xb8684a, fog: 0x6e5a52, near: 16, far: 90, sun: 0xff8a50, sunI: 1.25, hs: 0x7a7a94, hg: 0x362c24, hi: 1.12, elev: 5, dark: 0.35 },
  { h: 19.5, top: 0x161c30, hor: 0x4e3446, fog: 0x302e3a, near: 10, far: 62, sun: 0x8a9ac8, sunI: 0.6, hs: 0x505a7a, hg: 0x201e1a, hi: 0.99, elev: 38, dark: 0.72 },
  { h: 20.5, top: 0x0c1020, hor: 0x222436, fog: 0x1f2330, near: 6, far: 50, sun: 0x7c8cc0, sunI: 0.5, hs: 0x3c4466, hg: 0x141412, hi: 0.83, elev: 42, dark: 0.9 },
  { h: 23.0, top: 0x080a14, hor: 0x1a1c2a, fog: 0x1a1d28, near: 5, far: 44, sun: 0x7080b0, sunI: 0.45, hs: 0x343c5a, hg: 0x10100e, hi: 0.74, elev: 45, dark: 1 },
];

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function lerpColor(a, b, t, out) {
  _c1.setHex(a);
  _c2.setHex(b);
  return out.copy(_c1).lerp(_c2, t);
}

export class Environment {
  constructor(scene, { towerDir = new THREE.Vector3(-0.25, 0, -1), fogTint = null, shadows = true } = {}) {
    this.scene = scene;
    this.fogTint = fogTint;
    scene.fog = new THREE.Fog(0x888888, 20, 120);
    scene.background = new THREE.Color(0x222222);

    this.hemi = new THREE.HemisphereLight(0xb0c0d0, 0x4a4a3a, 1);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = shadows;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 1; sc.far = 160;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun);
    scene.add(this.sun.target);

    // sky dome
    this.skyUniforms = {
      top: { value: new THREE.Color(0x6f8aa0) },
      hor: { value: new THREE.Color(0xd4c6a2) },
      sunDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
      sunCol: { value: new THREE.Color(0xffd0a0) },
      glow: { value: 1 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
        fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y, -0.2, 1.0); float t = pow(max(h,0.0), 0.55); vec3 c = mix(hor, top, t);
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 1.2) * glow;
          if (h < 0.0) c = mix(hor, hor * 0.6, -h * 5.0);
          gl_FragColor = vec4(c, 1.0); }`,
      }),
    );
    sky.frustumCulled = false;
    sky.renderOrder = -10;
    this.sky = sky;
    scene.add(sky);

    // stars
    const starGeo = new THREE.BufferGeometry();
    const sp = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
      const y = Math.abs(u);
      const r = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * r * 400, y * 400 + 10, Math.sin(a) * r * 400);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    scene.add(this.stars);

    // moon
    const moonMat = new THREE.MeshBasicMaterial({ color: 0xe8ecf4, fog: false, transparent: true, opacity: 0 });
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(9, 24), moonMat);
    scene.add(this.moon);

    // water
    const nm = waterNormalTexture();
    nm.repeat.set(60, 60);
    this.waterNormal = nm;
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100).rotateX(-Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: 0x1b2723, specular: 0x6a7a70, shininess: 80, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5) }),
    );
    this.water.position.y = -0.32;
    this.water.receiveShadow = true;
    scene.add(this.water);

    this._buildTower(towerDir);

    this.time = 17;
    this.darkness = 0;
    this.sightRange = 24;
    this.drawDistance = 120;
    this.flicker = 0;
  }

  _buildTower(dir) {
    const d = dir.clone().normalize();
    const pos = d.multiplyScalar(230);
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x1a1a20, fog: false });
    const add = (geo, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); g.add(mesh); return mesh; };
    add(new THREE.BoxGeometry(14, 34, 14), 0, 17, 0);
    add(new THREE.BoxGeometry(24, 18, 30), 0, 9, 18);
    // belfry: four corner piers so the sky shows through the arches
    for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) add(new THREE.BoxGeometry(3, 10, 3), x, 39, z);
    add(new THREE.BoxGeometry(14.5, 1.5, 14.5), 0, 34.5, 0);
    add(new THREE.BoxGeometry(14.5, 1.5, 14.5), 0, 44.5, 0);
    const spire = add(new THREE.ConeGeometry(8, 22, 4), 0, 56, 0);
    spire.rotation.y = Math.PI / 4;
    add(new THREE.BoxGeometry(0.6, 5, 0.6), 0, 69, 0);
    add(new THREE.BoxGeometry(3, 0.6, 0.6), 0, 69.5, 0);
    // the bell
    const bell = add(new THREE.CylinderGeometry(1.8, 3.4, 4.2, 12), 0, 39, 0);
    this.bell = bell;
    this.bellGlow = new THREE.Mesh(new THREE.BoxGeometry(8, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff7a30, fog: false, transparent: true, opacity: 0 }));
    this.bellGlow.position.set(0, 39, 0);
    g.add(this.bellGlow);
    g.position.set(pos.x, -2, pos.z);
    g.lookAt(0, -2, 0);
    this.tower = g;
    this.towerPos = pos;
    this.scene.add(g);
  }

  setTime(h) {
    this.time = h;
    let i = 0;
    while (i < KEYS.length - 2 && h > KEYS[i + 1].h) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
    const sky = this.skyUniforms;
    lerpColor(a.top, b.top, t, sky.top.value);
    lerpColor(a.hor, b.hor, t, sky.hor.value);
    lerpColor(a.fog, b.fog, t, this.scene.fog.color);
    if (this.fogTint) this.scene.fog.color.lerp(_c1.setHex(this.fogTint), 0.2);
    this.scene.background.copy(this.scene.fog.color);
    this.scene.fog.near = lerp(a.near, b.near, t);
    this.scene.fog.far = lerp(a.far, b.far, t);
    lerpColor(a.sun, b.sun, t, this.sun.color);
    this.sun.intensity = lerp(a.sunI, b.sunI, t);
    lerpColor(a.hs, b.hs, t, this.hemi.color);
    lerpColor(a.hg, b.hg, t, this.hemi.groundColor);
    this.hemi.intensity = lerp(a.hi, b.hi, t);
    this.darkness = lerp(a.dark, b.dark, t);
    this.sightRange = lerp(26, 10, this.darkness);
    this.drawDistance = this.scene.fog.far + 12;

    // sun sets in the west; moon rises in the east
    const night = clamp((h - 18.9) / 0.8, 0, 1);
    const sunElev = THREE.MathUtils.degToRad(lerp(a.elev, b.elev, t));
    const sunAz = THREE.MathUtils.degToRad(night > 0.5 ? 70 : 255);
    this.lightDir = new THREE.Vector3(Math.cos(sunAz) * Math.cos(sunElev), Math.sin(sunElev), Math.sin(sunAz) * Math.cos(sunElev)).normalize();
    const realSunElev = THREE.MathUtils.degToRad(lerp(28, -12, clamp((h - 16) / 4, 0, 1)));
    sky.sunDir.value.set(Math.cos(THREE.MathUtils.degToRad(255)) * Math.cos(realSunElev), Math.sin(realSunElev), Math.sin(THREE.MathUtils.degToRad(255)) * Math.cos(realSunElev));
    lerpColor(0xffd0a0, 0xff6030, clamp((h - 17) / 2, 0, 1), sky.sunCol.value);
    sky.glow.value = 1 - night;
    this.stars.material.opacity = clamp((h - 19.2) / 1.2, 0, 1) * 0.9;
    this.moon.material.opacity = clamp((h - 19) / 1, 0, 1);
    this.water.material.color.setHex(0x1b2723).multiplyScalar(1 - this.darkness * 0.6);
  }

  update(dt, camPos, time) {
    const lp = this.lightDir || new THREE.Vector3(0, 1, 0);
    this.sun.position.set(camPos.x + lp.x * 70, lp.y * 70, camPos.z + lp.z * 70);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.target.updateMatrixWorld();
    // snap the shadow camera to texels to avoid shimmering
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    const moonDir = new THREE.Vector3(Math.cos(1.2) * 0.8, 0.45, Math.sin(1.2) * 0.8).normalize();
    this.moon.position.copy(camPos).addScaledVector(moonDir, 380);
    this.moon.lookAt(camPos);
    this.waterNormal.offset.x = time * 0.004;
    this.waterNormal.offset.y = time * 0.006;
    if (this.bellGlow.material.opacity > 0) this.bellGlow.material.opacity = Math.max(0, this.bellGlow.material.opacity - dt * 0.12);
  }

  ringBell() {
    this.bellGlow.material.opacity = 0.35;
  }

  dispose() {
    for (const o of [this.hemi, this.sun, this.sun.target, this.sky, this.stars, this.moon, this.water, this.tower]) this.scene.remove(o);
  }
}
