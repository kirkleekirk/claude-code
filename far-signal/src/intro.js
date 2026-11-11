import * as THREE from 'three';
import { COMMON } from './gfx/shaderlib.js';
import { G, commonUniforms, resetLights, addLight, commitLights } from './gfx/globals.js';
import { Geo, M, temp } from './gfx/geo.js';
import { litMaterial } from './gfx/materials.js';
import { buildGate, metalMat } from './world/structures.js';
import { buildSuit, animateSuit } from './entities/suit.js';
import { Sky } from './gfx/sky.js';
import { mulberry32 } from './core/noise.js';

const EARTH_SKY = {
  dayLength: 1e9, sunArc: 0.8, sunTilt: 0.5, startTime: 0.0,
  fogDensity: 0.0016, fogFalloff: 0.004, fogBase: 0, fogMax: 0.92,
  cloud: 0.42, aurora: 0, shine: 0x9fb4ff, shineI: 0.25, sunDisc: 0,
  giant: { az: 0, el: -80, size: 0.01, axis: [0, 1, 0], colA: 0, colB: 0, colC: 0, rim: 0, ring: 0, ringOn: false },
  moons: [{ az: -34, el: 30, size: 2.6, colA: 0xe8e4da, colB: 0xa8a49c, kind: 0 }],
  nebA: 0x202848, nebB: 0x302040, galN: [0.3, 0.55, 0.78], galX: [0.65, 0.55, -0.5],
  keys: [
    { s: -1, zenith: 0x060a1c, horizon: 0x9a5a34, glow: 0, glowI: 0, sun: 0, sunI: 0, ambSky: 0x1c2436, ambGround: 0x1a120e, ambI: 1, cloudLit: 0x7a4a34, cloudDark: 0x14121c, starVis: 0.5, nebVis: 0.15, planetVis: 1, exposure: 1.2, fog: 1 },
    { s: 1, zenith: 0x060a1c, horizon: 0x9a5a34, glow: 0, glowI: 0, sun: 0, sunI: 0, ambSky: 0x1c2436, ambGround: 0x1a120e, ambI: 1, cloudLit: 0x7a4a34, cloudDark: 0x14121c, starVis: 0.5, nebVis: 0.15, planetVis: 1, exposure: 1.2, fog: 1 },
  ],
};

const CITY_VERT = /* glsl */`
varying vec3 vWp; varying vec3 vN; varying float vSeed;
void main(){
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWp = wp.xyz; vN = normal;
  vSeed = instanceColor.r;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const CITY_FRAG = /* glsl */`
${COMMON}
varying vec3 vWp; varying vec3 vN; varying float vSeed;
float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
void main(){
  vec3 col = vec3(0.012, 0.014, 0.022);
  if (abs(vN.y) < 0.5){
    vec2 uv = (abs(vN.x) > 0.5 ? vWp.zy : vWp.xy) / vec2(3.4, 3.8);
    vec2 cell = floor(uv); vec2 f = fract(uv);
    float lit = step(0.6, hash(cell + vSeed * 71.0));
    float win = step(0.16, f.x) * step(f.x, 0.84) * step(0.24, f.y) * step(f.y, 0.8);
    vec3 warm = mix(vec3(1.0, 0.7, 0.36), vec3(0.55, 0.78, 1.0), step(0.72, hash(cell * 1.7 + vSeed)));
    col += win * lit * warm * (0.5 + 1.6 * hash(cell + 3.0));
    col += vec3(0.02, 0.016, 0.014) * smoothstep(40.0, 0.0, vWp.y);
  }
  col = applyFog(col, vWp);
  gl_FragColor = vec4(col, 1.0);
}`;

const SIGNAL_FRAG = /* glsl */`
uniform float uTime; uniform float uOn;
varying vec2 vUv2;
void main(){
  vec2 p = vUv2;
  float y = 0.5 + 0.18 * sin(p.x * 22.0 + uTime * 3.0) * sin(p.x * 5.3 - uTime * 1.1) + 0.1 * sin(p.x * 61.0 + uTime * 7.0) * step(0.5, fract(p.x * 4.0 - uTime * 0.2));
  float line = smoothstep(0.02, 0.0, abs(p.y - y));
  float grid = (step(0.97, fract(p.x * 12.0)) + step(0.95, fract(p.y * 6.0))) * 0.12;
  float blocks = step(0.55, fract(sin(floor(p.x * 28.0) * 12.9898 + floor(uTime * 2.0)) * 43758.5)) * step(p.y, 0.16) * step(0.04, p.y);
  vec3 col = vec3(0.3, 1.0, 0.95) * (line * 2.4 + grid + blocks * 0.6);
  float edge = smoothstep(0.0, 0.04, p.x) * smoothstep(1.0, 0.96, p.x) * smoothstep(0.0, 0.06, p.y) * smoothstep(1.0, 0.94, p.y);
  gl_FragColor = vec4(col * edge * uOn, 1.0);
}`;

const flat = (c, glow = 0) => (p, n, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = glow; };
function box(g, w, h, d, x, y, z, c, glow = 0, ry = 0) {
  g.add(temp(new THREE.BoxGeometry(w, h, d)), M.trs(x, y, z, 0, ry, 0), flat(c, glow), true);
}

// Earth prologue: the city, the lab, and the build.
export class Intro {
  constructor(game) {
    this.game = game;
    this.camera = new THREE.PerspectiveCamera(50, game.gfx.aspect, 0.1, 6000);
    this.t = 0; this.stage = 'city'; this.stageT = 0; this.line = -1; this.build = 0; this.buildK = [0, 0, 0, 0]; this.done = null; this.finished = false;
    this._city();
    this._lab();
    this.scene = this.city;
  }

  _city() {
    const s = (this.city = new THREE.Scene());
    this.sky = new Sky();
    this.sky.setPlanet(EARTH_SKY);
    s.add(this.sky.mesh);
    const r = mulberry32(2024);
    const n = 520;
    const mat = new THREE.ShaderMaterial({ vertexShader: CITY_VERT, fragmentShader: CITY_FRAG, uniforms: commonUniforms() });
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, n);
    const m4 = new THREE.Matrix4(), c = new THREE.Color();
    let k = 0;
    for (let gx = -13; gx < 13 && k < n; gx++) for (let gz = -3; gz < 17 && k < n; gz++) {
      if (Math.abs(gx) < 1 && gz < 9) continue;                      // the avenue the camera flies down
      const w = 22 + r() * 22, d = 22 + r() * 22;
      const centre = Math.exp(-(gx * gx + (gz - 9) * (gz - 9)) / 60);
      const h = 24 + r() * 60 + centre * (60 + r() * 190);
      m4.compose(new THREE.Vector3(gx * 62 + (r() - 0.5) * 12, h / 2, -gz * 62 + (r() - 0.5) * 12), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
      mesh.setMatrixAt(k, m4);
      mesh.setColorAt(k, c.setRGB(r(), 0, 0));
      k++;
    }
    mesh.count = k;
    mesh.frustumCulled = false;
    s.add(mesh);
    // Vigil tower with a beacon
    const g = new Geo();
    g.add(temp(new THREE.CylinderGeometry(9, 16, 330, 8)), M.trs(0, 165, -560), flat([0.02, 0.022, 0.03]), true);
    g.add(temp(new THREE.CylinderGeometry(26, 9, 16, 8)), M.trs(0, 330, -560), flat([0.03, 0.03, 0.04]), true);
    g.add(temp(new THREE.TorusGeometry(26, 1.2, 6, 30).rotateX(Math.PI / 2)), M.trs(0, 338, -560), flat([0.5, 0.9, 1.0], 1));
    g.add(temp(new THREE.CylinderGeometry(0.6, 0.6, 60, 6)), M.trs(0, 370, -560), flat([0.9, 0.95, 1.0], 1));
    for (let i = 0; i < 5; i++) g.add(temp(new THREE.BoxGeometry(0.8, 300, 0.8)), M.trs(Math.cos(i * 1.257) * 12, 160, -560 + Math.sin(i * 1.257) * 12), flat([0.4, 0.8, 1.0], 0.9));
    const tower = new THREE.Mesh(g.build(), litMaterial({ glow: 3 }));
    tower.frustumCulled = false;
    s.add(tower);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
      vertexShader: `varying vec3 vWp; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vWp = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: `${COMMON} varying vec3 vWp; void main(){ vec2 g = abs(fract(vWp.xz / 62.0 + 0.5) - 0.5); float road = smoothstep(0.34, 0.36, max(g.x, g.y)); vec3 col = vec3(0.01, 0.01, 0.014) + road * vec3(0.5, 0.3, 0.12) * 0.22 * (0.6 + 0.4 * sin(vWp.x * 0.7) * sin(vWp.z * 0.7)); gl_FragColor = vec4(applyFog(col, vWp), 1.0); }`,
      uniforms: commonUniforms(),
    }));
    s.add(ground);
    // hero streaks
    this.streaks = [];
    const cols = [[1.0, 0.82, 0.4], [0.45, 0.7, 1.0], [0.7, 0.5, 1.0]];
    for (let i = 0; i < 3; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(cols[i][0] * 6, cols[i][1] * 6, cols[i][2] * 6), toneMapped: false }));
      s.add(m);
      this.streaks.push({ m, c: cols[i], off: i * 2.1 });
    }
  }

  _lab() {
    const s = (this.lab = new THREE.Scene());
    const wall = [0.3, 0.32, 0.38], floor = [0.17, 0.18, 0.21], steel = [0.5, 0.54, 0.6], cy = [0.3, 0.95, 1.0];
    const g = new Geo();
    // room: 30 wide (x), 12 high, 26 deep (z)
    box(g, 30, 0.4, 26, 0, -0.2, 0, floor);
    box(g, 30, 0.4, 26, 0, 12.2, 0, [0.05, 0.055, 0.07]);
    box(g, 0.4, 12.4, 26, -15.2, 6, 0, wall); box(g, 0.4, 12.4, 26, 15.2, 6, 0, wall);
    box(g, 30, 12.4, 0.4, 0, 6, -13.2, wall); box(g, 30, 12.4, 0.4, 0, 6, 13.2, wall);
    for (let i = -3; i <= 3; i++) { box(g, 0.14, 0.03, 26, i * 4, 0.02, 0, [0.15, 0.4, 0.45], 0.25); box(g, 1.6, 0.08, 0.5, i * 4, 11.9, -4, [0.9, 0.95, 1.0], 1); box(g, 1.6, 0.08, 0.5, i * 4, 11.9, 5, [0.9, 0.95, 1.0], 1); }
    for (let i = -3; i <= 3; i++) box(g, 0.5, 12, 0.5, i * 4.8, 6, -12.9, steel);
    box(g, 30, 0.1, 0.12, 0, 3.2, -12.95, cy, 0.8); box(g, 0.12, 0.1, 26, -14.95, 3.2, 0, cy, 0.5); box(g, 0.12, 0.1, 26, 14.95, 3.2, 0, cy, 0.5);
    // benches and consoles along the left wall
    box(g, 2.2, 1.0, 9, -12.6, 0.5, 3, steel); box(g, 2.4, 0.1, 9.2, -12.6, 1.05, 3, [0.05, 0.055, 0.07]);
    for (let i = 0; i < 3; i++) { box(g, 0.1, 1.1, 1.7, -13.4, 1.9, 0.4 + i * 2.6, [0.04, 0.04, 0.05]); box(g, 0.03, 0.95, 1.5, -13.33, 1.9, 0.4 + i * 2.6, i === 1 ? [1.0, 0.6, 0.2] : cy, 0.7); }
    box(g, 4, 0.9, 1.6, 9, 0.45, 9.5, steel); box(g, 4.2, 0.08, 1.8, 9, 0.94, 9.5, [0.05, 0.055, 0.07]);
    // hero gear on lit plinths along the back wall
    const gear = [
      { x: -9.6, c: [0.45, 0.66, 1.0], build: (gg, x) => { gg.add(temp(new THREE.CylinderGeometry(0.42, 0.34, 0.9, 10, 1, true, -1.2, 2.4)), M.trs(x, 2.1, -11.2, 0.1, 0, 0), flat([0.12, 0.2, 0.45])); box(gg, 0.06, 0.7, 0.04, x, 2.1, -10.82, [0.45, 0.66, 1.0], 1); } },
      { x: -4.8, c: [1.0, 0.85, 0.5], build: (gg, x) => { for (const sx of [-0.3, 0.3]) { box(gg, 0.3, 0.6, 0.34, x + sx, 1.9, -11.2, [0.8, 0.8, 0.78]); box(gg, 0.32, 0.14, 0.62, x + sx, 1.57, -11.06, [0.8, 0.8, 0.78]); box(gg, 0.3, 0.03, 0.56, x + sx, 1.49, -11.06, [1.0, 0.85, 0.5], 1); } } },
      { x: 0, c: [0.56, 0.7, 1.0], build: (gg, x) => { gg.add(temp(new THREE.TorusGeometry(0.34, 0.07, 6, 18)), M.trs(x, 2.15, -11.2, 0, 0.5, 0), flat([0.56, 0.7, 1.0], 1)); gg.add(temp(new THREE.TorusGeometry(0.22, 0.05, 6, 16)), M.trs(x, 2.15, -11.2, 0, -0.6, 0), flat([0.8, 0.9, 1.0], 1)); box(gg, 0.26, 0.5, 0.2, x, 1.7, -11.2, [0.2, 0.22, 0.3]); } },
      { x: 4.8, c: [0.55, 1.0, 0.6], build: (gg, x) => { gg.add(temp(new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12)), M.trs(x, 2.0, -11.2), (p, n, o) => { o[0] = 0.2; o[1] = 0.6; o[2] = 0.3; o[3] = 0.35; }); gg.add(temp(new THREE.SphereGeometry(0.2, 8, 6)), M.trs(x, 2.1, -11.2, 0, 0, 0, 1, 1.5, 1), flat([0.55, 1.0, 0.6], 1)); } },
      { x: 9.6, c: [0.78, 0.6, 1.0], build: (gg, x) => { gg.add(temp(new THREE.OctahedronGeometry(0.4)), M.trs(x, 2.15, -11.2, 0, 0.4, 0, 1, 1.5, 1), flat([0.78, 0.6, 1.0], 0.9), true); } },
    ];
    this.gear = gear;
    for (const it of gear) {
      box(g, 1.5, 1.4, 1.5, it.x, 0.7, -11.2, [0.09, 0.1, 0.12]);
      box(g, 1.54, 0.05, 1.54, it.x, 1.42, -11.2, it.c, 0.8);
      it.build(g, it.x);
    }
    const room = new THREE.Mesh(g.build(), litMaterial({ wrap: 0.3, glow: 1.6, spec: 0.3, shin: 30, metal: 0.15 }));
    room.frustumCulled = false;
    s.add(room);
    // signal hologram above the bench
    this.signal = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.6), new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv2; void main(){ vUv2 = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: SIGNAL_FRAG, uniforms: { uTime: G.uTime, uOn: { value: 1 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    this.signal.position.set(-10.6, 3.4, 3);
    this.signal.rotation.y = Math.PI / 2;
    s.add(this.signal);
    // the machine
    this.gate = buildGate();
    this.gate.position.set(2, 0, -1);
    this.gate.rotation.y = -0.35;
    s.add(this.gate);
    this.gate.userData.body.material.uniforms.uMat2.value.x = 0.1;
    this.gate.userData.lattice.material.uniforms.uMat2.value.x = 0.1;
    this.gate.userData.body.visible = false; this.gate.userData.lattice.visible = false; this.gate.userData.lattice2.visible = false; this.gate.userData.portal.visible = false;
    // Vance
    this.rig = buildSuit(0, {});
    this.rig.root.position.set(-9.4, 0, 3.6);
    this.rig.root.rotation.y = -Math.PI / 2 - 0.2;
    s.add(this.rig.root);
  }

  start(done) {
    const g = this.game, ui = g.ui;
    this.done = done;
    ui.cine(true);
    ui.el.cineSkip.onclick = () => { g.audio.unlock(); this.finish(); };
    g.audio.setAmbient('earth');
    this._enter('city');
  }

  _enter(stage) {
    this.stage = stage; this.stageT = 0; this.line = -1;
    const c = this.game;
    if (stage === 'city') {
      this.scene = this.city;
      G.uInterior.value = 0; G.uWorld.value.w = 0;
      this.sky.setPlanet(EARTH_SKY);
    } else {
      this.scene = this.lab;
      G.uInterior.value = 1; G.uWorld.value.w = 0;
      G.uSunColor.value.setRGB(0, 0, 0);
      G.uAmbSky.value.setRGB(0.5, 0.56, 0.66); G.uAmbGround.value.setRGB(0.26, 0.28, 0.34);
      G.uHorizon.value.setRGB(0.1, 0.14, 0.2); G.uFog.value.set(0.004, 0.0001, 0, 0.5);
      G.uNight.value = 0;
    }
    c.ui.cineText('');
  }

  _say(lines) {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (this.stageT >= lines[i][0]) { if (this.line !== i) { this.line = i; this.game.ui.cineText(lines[i][1], !!lines[i][2]); } break; }
    }
  }

  async _cut(next) {
    if (this.cutting) return;
    this.cutting = true;
    await this.game.ui.fade(1, 700);
    next();
    await this.game.ui.fade(0, 900);
    this.cutting = false;
  }

  _offer() {
    const g = this.game, ui = g.ui;
    const labels = ['Print the frame', 'Wind the lattice', 'Seat the core', 'Open the Gate'];
    if (this.build >= 4) return;
    ui.cineAction(labels[this.build], () => {
      const u = this.gate.userData;
      const b = this.build;
      this.build++;
      this.buildT = 0;
      if (b === 0) { u.body.visible = true; g.audio.play('build'); }
      else if (b === 1) { u.lattice.visible = true; u.lattice2.visible = true; g.audio.play('craft'); }
      else if (b === 2) g.audio.play('shield');
      else { u.portal.visible = true; g.audio.play('warp'); g.warp = 1; }
      this.line = -1;
    });
  }

  update(dt) {
    if (this.finished) return;
    const g = this.game, ui = g.ui;
    this.t += dt; this.stageT += dt;
    g.time += dt; G.uTime.value = g.time;
    resetLights();
    const cam = this.camera, T = this.stageT;
    if (this.stage === 'city') {
      this.sky.update(0);
      const k = Math.min(1, T / 21);
      const e = k * k * (3 - 2 * k);
      cam.position.set(Math.sin(T * 0.11) * 14, 210 - e * 120, 420 - e * 600);
      cam.lookAt(Math.sin(T * 0.07) * 20, 190 - e * 60, -560);
      cam.fov = g.gfx.aspect < 1 ? 74 : 46;
      for (const st of this.streaks) {
        const a = T * 0.55 + st.off;
        const x = Math.sin(a) * 260 + Math.sin(a * 2.3) * 60, y = 230 + Math.sin(a * 1.7) * 90, z = -320 + Math.cos(a * 0.8) * 280;
        st.m.position.set(x, y, z);
        g.particles.emit(x, y, z, 0, 0, 0, 1.6, 7, st.c[0] * 1.4, st.c[1] * 1.4, st.c[2] * 1.4, 0, 0);
      }
      this._say([[0.6, 'MERIDIAN CITY', true], [4.2, 'The Vigil keeps this city standing. Five people who can fly, phase, regrow, and stop a train.'], [10.5, 'Someone has to build what they break.'], [15, 'Dr. Elias Vance. Sub-level four. No powers. Excellent tools.']]);
      if (T > 20.5) this._cut(() => this._enter('lab'));
    } else {
      // lab
      const u = this.gate.userData;
      addLight(-10.4, 3.4, 3, 9, 0.2, 0.75, 0.7, 2);
      for (const it of this.gear) addLight(it.x, 3.2, -10.2, 4.5, it.c[0] * 0.8, it.c[1] * 0.8, it.c[2] * 0.8);
      const glow = this.buildK[2];
      addLight(2, 3.4, 0.6, 16, 0.25 + glow * 0.5, 0.5 + glow * 0.8, 0.6 + glow * 0.9, 3);
      addLight(-8.2, 3.2, 4.4, 8, 0.9, 0.85, 0.75, 2);
      animateSuit(this.rig, { speed: 0, onGround: true, vy: 0, aiming: false, aimPitch: 0, hover: false, thrust: 0, time: g.time, sprint: false }, dt);
      // staged camera moves
      let px, py, pz, lx, ly, lz;
      if (this.build === 0 && T < 13) {
        const k = Math.min(1, T / 13);
        px = -3.5 - k * 1.5; py = 2.6; pz = 8.5 - k * 2.0; lx = -11; ly = 2.6; lz = 3;
        this._say([[0.5, '02:14. The deep-space array catches something that is not noise.'], [5.5, 'Not a greeting. Not a warning. A parts list, an assembly order, a wiring diagram.'], [10.5, 'Whoever sent it assumed the reader could build.']]);
      } else {
        const a = this.t * 0.07;
        px = 2 + Math.sin(a) * 4 - 6; py = 3.0 + Math.sin(a * 1.3) * 0.4; pz = 11.5; lx = 2; ly = 3.1; lz = -1;
        if (this.build === 0) this._say([[13, 'Rampart\'s load frames. Lodestar\'s field coils. Voltara\'s capacitors. Everything on these shelves taught me something.'], [19, 'Eleven days of work. Four steps left.']]);
        if (this.build === 0 && T > 19.5 && ui.el.cineAction.hidden) this._offer();
      }
      // build steps animate in
      for (let i = 0; i < 4; i++) if (this.build > i) this.buildK[i] = Math.min(1, this.buildK[i] + dt * (i === 3 ? 0.42 : 0.7));
      const e0 = 1 - Math.pow(1 - this.buildK[0], 3);
      u.body.scale.set(1, Math.max(0.001, e0), 1);
      const e1 = 1 - Math.pow(1 - this.buildK[1], 3);
      u.lattice.scale.setScalar(Math.max(0.001, e1)); u.lattice2.scale.setScalar(Math.max(0.001, e1 * 0.72));
      u.lattice.rotation.z += dt * (0.6 + this.buildK[2] * 3 + this.buildK[3] * 9);
      u.lattice2.rotation.z -= dt * (0.9 + this.buildK[2] * 4 + this.buildK[3] * 12);
      u.body.material.uniforms.uMat2.value.x = 0.1 + this.buildK[2] * 1.6;
      u.lattice.material.uniforms.uMat2.value.x = 0.2 + this.buildK[2] * 2.2;
      u.portal.material.uniforms.uOn.value = this.buildK[3];
      if (this.build > 0 && this.build < 4) {
        this.buildT += dt;
        const lines = ['The frame takes nine hours to print. It hums at a pitch the blueprint specified to the hertz.', 'Forty kilometres of lattice wire, wound by hand, because no machine on Earth has the pattern.', 'The core seats with a click. Every light in the building dims.'];
        if (this.buildT > 0.4 && this.line !== 100 + this.build) { this.line = 100 + this.build; ui.cineText(lines[this.build - 1]); }
        if (this.buildT > 4.2 && ui.el.cineAction.hidden) this._offer();
        if (Math.random() < dt * 20) g.particles.emit(2 + (Math.random() - 0.5) * 5, 0.5 + Math.random() * 5.5, -1 + (Math.random() - 0.5), (Math.random() - 0.5) * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 2, 0.6, 0.35, 0.4, 0.9, 1.0, 3, 1);
      }
      if (this.build === 4) {
        this.buildT += dt;
        if (this.line !== 200 && this.buildT > 0.3) { this.line = 200; ui.cineText('It was supposed to open a window.'); }
        const kk = Math.min(1, this.buildT / 4.5);
        px += (2 - px) * kk * 0.85; pz += (4.5 - pz) * kk; py += (3.2 - py) * kk;
        g.shake(0.2 + kk * 0.6);
        px += (Math.random() - 0.5) * kk * 0.12; py += (Math.random() - 0.5) * kk * 0.12;
        for (let i = 0; i < 3; i++) g.particles.emit(2 + (Math.random() - 0.5) * 4, 3.2 + (Math.random() - 0.5) * 4, -0.6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 6 + Math.random() * 10, 0.6, 0.6, 0.5, 1, 1, 0, 0);
        if (this.buildT > 2.2 && !this.flash) { this.flash = true; ui.cineText(''); ui.fade(1, 2400, '#e6fdff'); }
        if (this.buildT > 4.8) { this.finish(); return; }
      }
      cam.position.set(px, py, pz);
      cam.lookAt(lx, ly, lz);
      cam.fov = g.gfx.aspect < 1 ? 78 : 52;
      commitLights(cam.position.x, cam.position.y, cam.position.z - 6);
    }
    g.particles.update(dt, g.gfx.ph, cam.fov);
  }

  async finish() {
    if (this.finished) return;
    this.finished = true;
    const g = this.game, ui = g.ui;
    ui.cineAction(null);
    ui.cineText('');
    if (!this.flash) await ui.fade(1, 700, '#e6fdff');
    else await new Promise((r) => setTimeout(r, 300));
    ui.cine(false);
    g.warp = 0;
    g.particles.clear();
    if (this.done) { const d = this.done; this.done = null; d(); }
  }

  render(gfx) {
    const cam = this.camera;
    cam.aspect = gfx.aspect;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    const pts = this.game.particles.points;
    if (pts.parent !== this.scene) this.scene.add(pts);
    if (this.stage === 'city') this.sky.follow(cam);
    gfx.mFinal.uniforms.uExposure.value = this.stage === 'city' ? 1.25 : 1.15;
    gfx.render(this.scene, cam, {});
  }

  dispose() {
    const g = this.game;
    g.scene.add(g.particles.points);
    for (const s of [this.city, this.lab]) s.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); } });
  }
}
