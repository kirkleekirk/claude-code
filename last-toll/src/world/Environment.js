import * as THREE from 'three';
import { waterNormalTexture, radialTexture } from './Textures.js';
import { lerp, clamp } from '../core/math.js';

// Sky, fog, sun/moon, water, ground mist, fireflies, lightning, and the Living
// Guard's herder mast on the horizon. Time is in hours (17.0 = 5 PM; 25.0 = 1 AM).
// A mood picks the lighting track: dusk raids fall into night; night and swamp
// raids start in the dark.

const DUSK = [
  { h: 16.0, top: 0x66788c, hor: 0xbcae92, fog: 0x8c8a7c, near: 20, far: 120, sun: 0xffdcb0, sunI: 2.2, hs: 0xa8b4c0, hg: 0x44443a, hi: 1.75, elev: 30, dark: 0 },
  { h: 17.5, top: 0x4c5a74, hor: 0xb89272, fog: 0x847a6c, near: 17, far: 100, sun: 0xffbe86, sunI: 1.8, hs: 0x949aa8, hg: 0x403a2e, hi: 1.5, elev: 16, dark: 0.1 },
  { h: 18.6, top: 0x2a3048, hor: 0x8a5446, fog: 0x5a4c4a, near: 13, far: 78, sun: 0xe0784c, sunI: 1.1, hs: 0x6e6e86, hg: 0x302a24, hi: 1.05, elev: 4, dark: 0.4 },
  { h: 19.5, top: 0x121828, hor: 0x3a2a38, fog: 0x2a2a32, near: 9, far: 56, sun: 0x8a9ac8, sunI: 0.55, hs: 0x4a5270, hg: 0x1c1a18, hi: 0.92, elev: 38, dark: 0.74 },
  { h: 20.5, top: 0x0a0e1a, hor: 0x1c1e2c, fog: 0x1c1f2a, near: 6, far: 46, sun: 0x7888b8, sunI: 0.46, hs: 0x384060, hg: 0x121210, hi: 0.78, elev: 42, dark: 0.92 },
  { h: 26.0, top: 0x070912, hor: 0x161824, fog: 0x171a24, near: 5, far: 42, sun: 0x6c7aa8, sunI: 0.42, hs: 0x303652, hg: 0x0e0e0c, hi: 0.7, elev: 45, dark: 1 },
];
const NIGHT = [
  { h: 20.0, top: 0x0c1020, hor: 0x20222e, fog: 0x1e212c, near: 7, far: 52, sun: 0x8090c0, sunI: 0.5, hs: 0x3c4466, hg: 0x141412, hi: 0.82, elev: 40, dark: 0.9 },
  { h: 26.0, top: 0x06080f, hor: 0x141620, fog: 0x151820, near: 5, far: 44, sun: 0x6c7aa8, sunI: 0.42, hs: 0x2e3450, hg: 0x0c0c0a, hi: 0.7, elev: 48, dark: 1 },
];
const SWAMP = [
  { h: 20.0, top: 0x0a100e, hor: 0x1c2620, fog: 0x19221d, near: 5, far: 44, sun: 0x9ab09a, sunI: 0.42, hs: 0x3c4c40, hg: 0x0c100c, hi: 0.78, elev: 36, dark: 0.95 },
  { h: 26.0, top: 0x060a08, hor: 0x121a16, fog: 0x121a16, near: 4, far: 38, sun: 0x8aa08a, sunI: 0.36, hs: 0x324238, hg: 0x0a0c0a, hi: 0.66, elev: 44, dark: 1 },
];
const TRACKS = { dusk: DUSK, night: NIGHT, swamp: SWAMP };

const _c1 = new THREE.Color();
const _c2 = new THREE.Color();

function lerpColor(a, b, t, out) {
  _c1.setHex(a);
  _c2.setHex(b);
  return out.copy(_c1).lerp(_c2, t);
}

const MIST_VERT = `varying vec3 vWorld;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const MIST_FRAG = `uniform vec3 color; uniform float time; uniform float density; uniform vec3 cam; uniform float reach; uniform float seed;
varying vec3 vWorld;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }
void main(){
  vec2 p = vWorld.xz * 0.07 + vec2(time * 0.018 + seed, time * 0.011);
  float n = fbm(p) * 0.65 + fbm(p * 2.6 - vec2(time * 0.025)) * 0.35;
  float d = length(vWorld.xz - cam.xz);
  float fade = (1.0 - smoothstep(reach * 0.55, reach, d)) * smoothstep(0.4, 3.0, d);
  float edge = clamp(abs(cam.y - vWorld.y) / 0.5, 0.0, 1.0);
  float a = smoothstep(0.32, 0.78, n) * density * fade * edge;
  gl_FragColor = vec4(color, a);
}`;

export class Environment {
  constructor(scene, { mastDir = null, fogTint = null, shadows = true, mood = 'dusk', mist = null, fireflies = false, storm = false, waterY = -0.32 } = {}) {
    this.scene = scene;
    this.fogTint = fogTint;
    this.mood = mood;
    this.keys = TRACKS[mood] || DUSK;
    this.storm = storm;
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
      flash: { value: 0 },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }`,
        fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float glow; uniform float flash; varying vec3 vDir;
          void main(){ float h = clamp(vDir.y, -0.2, 1.0); float t = pow(max(h,0.0), 0.55); vec3 c = mix(hor, top, t);
          float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0); c += sunCol * (pow(s, 12.0) * 0.35 + pow(s, 400.0) * 1.2) * glow;
          if (h < 0.0) c = mix(hor, hor * 0.6, -h * 5.0);
          c += vec3(0.55, 0.58, 0.7) * flash * (0.4 + 0.6 * t);
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

    // moon, a little sick in the swamp
    const moonMat = new THREE.MeshBasicMaterial({ color: mood === 'swamp' ? 0xd8e0c4 : 0xe8ecf4, fog: false, transparent: true, opacity: 0 });
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(9, 24), moonMat);
    scene.add(this.moon);

    // water
    const nm = waterNormalTexture();
    nm.repeat.set(60, 60);
    this.waterNormal = nm;
    this.waterBase = mood === 'swamp' ? 0x141c16 : 0x1b2723;
    this.water = new THREE.Mesh(
      new THREE.PlaneGeometry(1100, 1100).rotateX(-Math.PI / 2),
      new THREE.MeshPhongMaterial({ color: this.waterBase, specular: 0x6a7a70, shininess: 80, normalMap: nm, normalScale: new THREE.Vector2(0.5, 0.5) }),
    );
    this.water.position.y = waterY;
    this.waterY = waterY;
    this.water.receiveShadow = true;
    scene.add(this.water);

    this._buildMast(mastDir || new THREE.Vector3(-0.25, 0, -1));

    // ground mist layers
    this.mist = [];
    const layers = mist || (mood === 'swamp' ? [[waterY + 0.25, 0.75], [waterY + 0.8, 0.6], [0.35, 0.35]] : [[0.18, 0.45], [0.55, 0.35], [0.95, 0.22]]);
    for (let i = 0; i < layers.length; i++) {
      const [y, density] = layers[i];
      const mat = new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color() }, time: { value: 0 }, density: { value: density }, cam: { value: new THREE.Vector3() }, reach: { value: 60 }, seed: { value: i * 17.3 } },
        vertexShader: MIST_VERT, fragmentShader: MIST_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      });
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(140, 140).rotateX(-Math.PI / 2), mat);
      plane.position.y = y;
      plane.renderOrder = 5;
      plane.frustumCulled = false;
      scene.add(plane);
      this.mist.push(plane);
    }

    // fireflies
    this.flies = null;
    if (fireflies) {
      const n = 140;
      const g = new THREE.BufferGeometry();
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      this.flyData = [];
      for (let i = 0; i < n; i++) this.flyData.push({ x: (Math.random() - 0.5) * 60, y: 0.4 + Math.random() * 2.5, z: (Math.random() - 0.5) * 60, ph: Math.random() * 20, sp: 0.3 + Math.random() * 0.8 });
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.flies = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.18, map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      this.flies.frustumCulled = false;
      scene.add(this.flies);
    }

    this.time = 17;
    this.darkness = 0;
    this.sightRange = 24;
    this.drawDistance = 120;
    this.flash = 0;
    this.nextStrike = 12 + Math.random() * 20;
    this.onThunder = null;
    this.sweep = 0;
  }

  // The Living Guard's herder mast: a lattice tower of sonic horns that calls the dead.
  _buildMast(dir) {
    const d = dir.clone().setY(0).normalize();
    const pos = d.clone().multiplyScalar(235);
    const g = new THREE.Group();
    const m = new THREE.MeshBasicMaterial({ color: 0x101216, fog: false });
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, mat = m) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.rotation.set(rx, ry, rz);
      g.add(mesh);
      return mesh;
    };
    const H = 78;
    const widthAt = (y) => lerp(12, 2.2, y / H);
    const seg = 9;
    for (let i = 0; i < seg; i++) {
      const y0 = (i / seg) * H, y1 = ((i + 1) / seg) * H;
      const w0 = widthAt(y0), w1 = widthAt(y1), ym = (y0 + y1) / 2, wm = (w0 + w1) / 2;
      const lean = Math.atan2((w0 - w1) / 2, y1 - y0);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        add(new THREE.BoxGeometry(0.45, y1 - y0 + 0.2, 0.45), (sx * wm) / 2, ym, (sz * wm) / 2, sz * lean, 0, -sx * lean);
      }
      // X-braces on each face
      const diag = Math.hypot(wm, y1 - y0);
      const ang = Math.atan2(y1 - y0, wm);
      for (const face of [0, 1, 2, 3]) {
        const ry = (face * Math.PI) / 2;
        const ox = Math.sin(ry) * (wm / 2), oz = Math.cos(ry) * (wm / 2);
        add(new THREE.BoxGeometry(diag, 0.18, 0.18), ox, ym, oz, 0, ry, ang);
        add(new THREE.BoxGeometry(diag, 0.18, 0.18), ox, ym, oz, 0, ry, -ang);
      }
      add(new THREE.BoxGeometry(w1 + 0.4, 0.3, w1 + 0.4), 0, y1, 0);
    }
    // herder horns: a crown of flared speakers
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const horn = add(new THREE.CylinderGeometry(1.6, 0.35, 3.6, 8, 1, true), Math.cos(a) * 1.8, H + 1.2, Math.sin(a) * 1.8, 0, 0, 0);
      horn.lookAt(g.position.x + Math.cos(a) * 20, H + 1.2, g.position.z + Math.sin(a) * 20);
      horn.rotateX(Math.PI / 2);
      horn.material = new THREE.MeshBasicMaterial({ color: 0x14161a, fog: false, side: THREE.DoubleSide });
    }
    add(new THREE.CylinderGeometry(0.3, 0.3, 12, 6), 0, H + 7, 0);
    // walled compound at the foot
    add(new THREE.BoxGeometry(60, 6, 1.5), 0, 3, -20);
    add(new THREE.BoxGeometry(60, 6, 1.5), 0, 3, 20);
    add(new THREE.BoxGeometry(1.5, 6, 40), -30, 3, 0);
    add(new THREE.BoxGeometry(1.5, 6, 40), 30, 3, 0);
    add(new THREE.BoxGeometry(14, 9, 10), -14, 4.5, 4);
    add(new THREE.BoxGeometry(10, 7, 14), 16, 3.5, -2);
    // red warning lights that blink, and flood lights on the wall
    this.mastLights = [];
    const redMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false, transparent: true });
    for (const y of [H * 0.35, H * 0.7, H + 13]) {
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        const w = widthAt(Math.min(y, H)) / 2 + 0.4;
        this.mastLights.push(add(new THREE.BoxGeometry(0.9, 0.9, 0.9), sx * w, y, sz * w, 0, 0, 0, redMat));
      }
    }
    this.redMat = redMat;
    const floodMat = new THREE.MeshBasicMaterial({ color: 0xfff0d0, fog: false });
    for (const x of [-26, -8, 12, 28]) add(new THREE.BoxGeometry(1.2, 0.8, 0.8), x, 7.5, 20.5, 0, 0, 0, floodMat);
    // searchlight beams (visible during the Sweep)
    const beamMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,235,210,0.5)', 'rgba(255,235,210,0)'), color: 0xfff0dc, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide });
    this.beams = [];
    for (let i = 0; i < 2; i++) {
      const beam = new THREE.Mesh(new THREE.ConeGeometry(9, 160, 16, 1, true).translate(0, -80, 0), beamMat);
      beam.position.set(i ? 8 : -8, 9, 18);
      g.add(beam);
      this.beams.push(beam);
    }
    this.beamMat = beamMat;
    g.position.set(pos.x, -2, pos.z);
    this.mastGroup = g;
    this.mastPos = pos;
    this.scene.add(g);
  }

  setTime(h) {
    this.time = h;
    const keys = this.keys;
    let i = 0;
    while (i < keys.length - 2 && h > keys[i + 1].h) i++;
    const a = keys[i], b = keys[i + 1];
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
    this.baseHemi = lerp(a.hi, b.hi, t);
    this.hemi.intensity = this.baseHemi * (1 + this.flash * 3);
    this.darkness = lerp(a.dark, b.dark, t);
    this.sightRange = lerp(26, 10, this.darkness);
    this.drawDistance = this.scene.fog.far + 12;

    // the sun sets in the west; afterwards the moon stands in the east
    const dusk = this.mood === 'dusk';
    const night = dusk ? clamp((h - 18.9) / 0.8, 0, 1) : 1;
    const sunElev = THREE.MathUtils.degToRad(lerp(a.elev, b.elev, t));
    const sunAz = THREE.MathUtils.degToRad(night > 0.5 ? 70 : 255);
    this.lightDir = new THREE.Vector3(Math.cos(sunAz) * Math.cos(sunElev), Math.sin(sunElev), Math.sin(sunAz) * Math.cos(sunElev)).normalize();
    const realSunElev = THREE.MathUtils.degToRad(dusk ? lerp(28, -12, clamp((h - 16) / 4, 0, 1)) : -20);
    sky.sunDir.value.set(Math.cos(THREE.MathUtils.degToRad(255)) * Math.cos(realSunElev), Math.sin(realSunElev), Math.sin(THREE.MathUtils.degToRad(255)) * Math.cos(realSunElev));
    lerpColor(0xffc890, 0xd05030, clamp((h - 17) / 2, 0, 1), sky.sunCol.value);
    sky.glow.value = 1 - night;
    this.stars.material.opacity = (dusk ? clamp((h - 19.2) / 1.2, 0, 1) : 1) * (this.mood === 'swamp' ? 0.45 : 0.9);
    this.moon.material.opacity = dusk ? clamp((h - 19) / 1, 0, 1) : this.mood === 'swamp' ? 0.7 : 1;
    this.water.material.color.setHex(this.waterBase).multiplyScalar(1 - this.darkness * 0.55);
  }

  update(dt, camPos, time) {
    const lp = this.lightDir || new THREE.Vector3(0, 1, 0);
    this.sun.position.set(camPos.x + lp.x * 70, lp.y * 70, camPos.z + lp.z * 70);
    this.sun.target.position.set(camPos.x, 0, camPos.z);
    this.sun.target.updateMatrixWorld();
    this.sky.position.copy(camPos);
    this.stars.position.copy(camPos);
    const moonDir = new THREE.Vector3(Math.cos(1.2) * 0.8, 0.45, Math.sin(1.2) * 0.8).normalize();
    this.moon.position.copy(camPos).addScaledVector(moonDir, 380);
    this.moon.lookAt(camPos);
    this.waterNormal.offset.x = time * 0.004;
    this.waterNormal.offset.y = time * 0.006;

    // mist follows the camera; brightness tracks the ambient light
    const fogC = this.scene.fog.color;
    for (const p of this.mist) {
      p.position.x = Math.round(camPos.x / 4) * 4;
      p.position.z = Math.round(camPos.z / 4) * 4;
      const u = p.material.uniforms;
      u.time.value = time;
      u.cam.value.copy(camPos);
      u.reach.value = Math.min(65, this.scene.fog.far);
      u.color.value.copy(fogC).multiplyScalar(1.25 + this.darkness * 0.4 + this.flash * 2);
    }

    if (this.flies) {
      const pos = this.flies.geometry.attributes.position, col = this.flies.geometry.attributes.color;
      for (let i = 0; i < this.flyData.length; i++) {
        const f = this.flyData[i];
        f.x += Math.sin(time * f.sp + f.ph) * dt * 0.5;
        f.z += Math.cos(time * f.sp * 0.8 + f.ph) * dt * 0.5;
        let x = f.x, z = f.z;
        // keep them in a box around the camera
        if (x - camPos.x > 30) f.x -= 60; else if (x - camPos.x < -30) f.x += 60;
        if (z - camPos.z > 30) f.z -= 60; else if (z - camPos.z < -30) f.z += 60;
        pos.setXYZ(i, f.x, f.y + Math.sin(time * 1.3 + f.ph) * 0.2 + (this.waterFlies ?? 0), f.z);
        const b = Math.max(0, Math.sin(time * 1.7 * f.sp + f.ph * 3)) ** 3;
        col.setXYZ(i, 0.75 * b, 0.95 * b, 0.35 * b);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }

    // lightning
    if (this.storm) {
      this.nextStrike -= dt;
      if (this.nextStrike <= 0) {
        this.nextStrike = 18 + Math.random() * 35;
        this.strikeT = 0;
        this.onThunder?.(0.8 + Math.random() * 2.5);
      }
      if (this.strikeT !== undefined) {
        this.strikeT += dt;
        const k = this.strikeT;
        this.flash = k < 0.07 ? 1 : k < 0.14 ? 0.1 : k < 0.24 ? 0.8 : Math.max(0, 0.5 - (k - 0.24) * 2);
        if (k > 0.6) { this.flash = 0; this.strikeT = undefined; }
        this.hemi.intensity = this.baseHemi * (1 + this.flash * 3);
        this.skyUniforms.flash.value = this.flash;
      }
    }

    // mast: slow red blink; during the Sweep it strobes and the searchlights move
    const blink = this.sweep > 0 ? (Math.sin(time * 9) > 0 ? 1 : 0.15) : (Math.sin(time * 2.2) > 0.6 ? 1 : 0.2);
    this.redMat.opacity = blink;
    this.beamMat.opacity = this.sweep > 0 ? 0.35 : 0;
    for (let i = 0; i < this.beams.length; i++) {
      const b = this.beams[i];
      b.rotation.z = Math.sin(time * 0.35 + i * 2.1) * 0.7;
      b.rotation.x = -0.5 + Math.cos(time * 0.27 + i) * 0.3;
    }
  }

  startSweep() {
    this.sweep = 1;
  }

  dispose() {
    for (const o of [this.hemi, this.sun, this.sun.target, this.sky, this.stars, this.moon, this.water, this.mastGroup, this.flies, ...this.mist]) if (o) this.scene.remove(o);
  }
}
