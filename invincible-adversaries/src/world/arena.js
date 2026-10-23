import * as THREE from 'three';

/**
 * The map being played. Gameplay code reads its bounds, ceiling, spawns and ground from here; a map
 * swaps them in with useMap() (the training arena below is the default).
 *  - plazaR: the open middle bots keep to; boundR: the circular wall (when rect is null)
 *  - rect: { minX, maxX, minZ, maxZ } walls of a rectangular map
 *  - terrain(x, z): ground height (null = flat at 0); terrainMax: its highest point
 *  - spawns[team]: spawn point; spawnSpread: how far around it heroes appear
 *  - orbs: [x, z] health orb spots
 */
export const ARENA = {};
const TRAINING = {
  name: 'arena',
  plazaR: 78,
  boundR: 135,
  ceiling: 130,
  rect: null,
  terrain: null,
  terrainMax: 0,
  spawns: [new THREE.Vector3(0, 0, -52), new THREE.Vector3(0, 0, 52)],
  spawnSpread: 3,
  orbs: [[-40, -18], [40, 18], [40, -18], [-40, 18]],
};
/** make cfg the current map (unset fields take the training arena's values) */
export function useMap(cfg) {
  for (const k of Object.keys(ARENA)) delete ARENA[k];
  Object.assign(ARENA, TRAINING, cfg);
}
useMap(TRAINING);
/** ground height at x, z on the current map */
export function terrainY(x, z) { return ARENA.terrain ? ARENA.terrain(x, z) : 0; }
/** keep p (with radius r) inside the current map's walls, dropping velocity into them */
export function clampToBounds(p, vel, r = 0) {
  const b = ARENA.rect;
  if (b) {
    if (p.x < b.minX + r) { p.x = b.minX + r; if (vel && vel.x < 0) vel.x = 0; }
    if (p.x > b.maxX - r) { p.x = b.maxX - r; if (vel && vel.x > 0) vel.x = 0; }
    if (p.z < b.minZ + r) { p.z = b.minZ + r; if (vel && vel.z < 0) vel.z = 0; }
    if (p.z > b.maxZ - r) { p.z = b.maxZ - r; if (vel && vel.z > 0) vel.z = 0; }
    return;
  }
  const R = Math.hypot(p.x, p.z), B = ARENA.boundR;
  if (R > B) {
    p.x *= B / R; p.z *= B / R;
    if (vel) { const vo = (vel.x * p.x + vel.z * p.z) / B; if (vo > 0) { vel.x -= p.x / B * vo; vel.z -= p.z / B * vo; } }
  }
}

const SKY_VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const SKY_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uSunDir;
  uniform float uTime;
  uniform vec3 uZenith, uHorizon, uGround;
  uniform float uSunDisc;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 6; i++) { s += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
    return s;
  }
  void main() {
    vec3 d = normalize(vDir);
    float h = d.y;
    vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.5));
    col = mix(col, uGround, smoothstep(0.0, -0.08, h));
    float sd = max(dot(d, uSunDir), 0.0);
    col += vec3(1.0, 0.85, 0.6) * pow(sd, 6.0) * 0.25;
    col += vec3(1.0, 0.9, 0.7) * pow(sd, 64.0) * 0.6;
    // cel-shaded cumulus
    if (h > 0.0) {
      vec2 p = d.xz / (h + 0.18) * 1.6 + vec2(uTime * 0.006, uTime * 0.002);
      float n = fbm(p);
      float n2 = fbm(p + uSunDir.xz * 0.12);
      float mask = smoothstep(0.52, 0.56, n) * smoothstep(0.0, 0.12, h);
      float shade = smoothstep(0.02, -0.02, n2 - n);
      vec3 lit = vec3(1.08, 1.06, 1.02);
      vec3 dark = mix(uHorizon, vec3(0.62, 0.68, 0.82), 0.6);
      vec3 cc = mix(dark, lit, 0.35 + 0.65 * shade);
      float rim = smoothstep(0.52, 0.535, n) - smoothstep(0.535, 0.56, n);
      cc += rim * 0.15;
      col = mix(col, cc, mask * 0.95 * (1.0 - smoothstep(0.65, 0.95, 1.0 - h) * 0.5));
    }
    // sun disc (HDR for bloom)
    col += vec3(1.0, 0.92, 0.8) * smoothstep(0.9993, 0.9997, sd) * 6.0 * uSunDisc;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function makeSky(sunDir) {
  const geo = new THREE.SphereGeometry(1, 48, 24);
  const mat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: true,
    uniforms: {
      uSunDir: { value: sunDir.clone() }, uTime: { value: 0 }, uSunDisc: { value: 1 },
      uZenith: { value: new THREE.Color(0.06, 0.24, 0.72) },
      uHorizon: { value: new THREE.Color(0.5, 0.7, 0.95) },
      uGround: { value: new THREE.Color(0.48, 0.55, 0.6) },
    },
  });
  const m = new THREE.Mesh(geo, mat);
  m.scale.setScalar(2500);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

// ---------- procedural ground textures ----------
function layoutTexture() {
  const S = 2048;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  const W = 320; // meters covered
  const m2p = S / W;
  const cx = S / 2, cy = S / 2;
  // grass base
  g.fillStyle = '#7fbf58'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 10;
    g.fillStyle = `rgba(${100 + Math.random() * 50},${150 + Math.random() * 50},${60 + Math.random() * 30},${0.18 + Math.random() * 0.2})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // plaza
  const R = ARENA.plazaR * m2p;
  const grad = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
  grad.addColorStop(0, '#aeb3ba'); grad.addColorStop(1, '#9aa0a8');
  g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  // curb
  g.lineWidth = 2.2 * m2p; g.strokeStyle = '#8d939a'; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 0.5 * m2p; g.strokeStyle = '#e8eaec'; g.beginPath(); g.arc(cx, cy, R - 1.6 * m2p, 0, Math.PI * 2); g.stroke();
  // stained tiles
  g.save(); g.beginPath(); g.arc(cx, cy, R - 1.2 * m2p, 0, Math.PI * 2); g.clip();
  const tile = 4 * m2p;
  for (let x = -R; x < R; x += tile) for (let y = -R; y < R; y += tile) {
    const v = Math.random();
    g.fillStyle = `rgba(${v < 0.5 ? '90,95,100' : '255,255,255'},${0.03 + Math.random() * 0.06})`;
    g.fillRect(cx + x, cy + y, tile, tile);
  }
  g.strokeStyle = 'rgba(70,75,82,0.35)'; g.lineWidth = 1.2;
  for (let x = -R; x < R; x += tile) { g.beginPath(); g.moveTo(cx + x, cy - R); g.lineTo(cx + x, cy + R); g.stroke(); }
  for (let y = -R; y < R; y += tile) { g.beginPath(); g.moveTo(cx - R, cy + y); g.lineTo(cx + R, cy + y); g.stroke(); }
  // painted rings
  const ring = (r, w, col) => { g.lineWidth = w * m2p; g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, r * m2p, 0, Math.PI * 2); g.stroke(); };
  ring(12, 0.6, 'rgba(232,196,30,0.7)');
  ring(13.2, 0.25, 'rgba(232,196,30,0.7)');
  ring(36, 0.35, 'rgba(255,255,255,0.55)');
  ring(60, 0.6, 'rgba(20,150,210,0.6)');
  // radial spokes
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.25 * m2p;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * 13.5 * m2p, cy + Math.sin(a) * 13.5 * m2p); g.lineTo(cx + Math.cos(a) * 59.5 * m2p, cy + Math.sin(a) * 59.5 * m2p); g.stroke();
  }
  // center emblem: stylised globe
  g.save(); g.translate(cx, cy);
  g.fillStyle = 'rgba(40,100,150,0.32)'; g.beginPath(); g.arc(0, 0, 9 * m2p, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(232,196,30,0.85)'; g.lineWidth = 0.7 * m2p;
  g.beginPath(); g.arc(0, 0, 9 * m2p, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 0.35 * m2p;
  for (const k of [0.35, 0.7]) { g.beginPath(); g.ellipse(0, 0, 9 * m2p * k, 9 * m2p, 0, 0, Math.PI * 2); g.stroke(); }
  for (const k of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(-9 * m2p * Math.sqrt(1 - k * k), k * 9 * m2p); g.lineTo(9 * m2p * Math.sqrt(1 - k * k), k * 9 * m2p); g.stroke(); }
  g.restore();
  // spawn pads
  const pad = (z, col) => {
    const y = cy + z * m2p;
    g.fillStyle = col; g.globalAlpha = 0.85;
    g.beginPath(); g.arc(cx, y, 7 * m2p, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 0.4 * m2p;
    g.beginPath(); g.arc(cx, y, 7.8 * m2p, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx, y, 4 * m2p, 0, Math.PI * 2); g.stroke();
  };
  // canvas y maps to world +z
  pad(ARENA.spawns[0].z, 'rgba(50,110,180,0.55)');
  pad(ARENA.spawns[1].z, 'rgba(190,50,60,0.55)');
  // cracks / wear
  g.strokeStyle = 'rgba(60,62,68,0.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) {
    let x = cx + (Math.random() - 0.5) * R * 1.8, y = cy + (Math.random() - 0.5) * R * 1.8;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return { tex: t, size: W };
}

function detailTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = 118 + Math.random() * 26;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},${Math.random() < 0.5 ? 0 : 255},0.025)`;
    g.beginPath(); g.arc(Math.random() * S, Math.random() * S, 6 + Math.random() * 40, 0, Math.PI * 2); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function makeGround() {
  const lay = layoutTexture();
  const det = detailTexture();
  const geo = new THREE.PlaneGeometry(3000, 3000, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, map: det });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLayout = { value: lay.tex };
    sh.uniforms.uLayoutSize = { value: lay.size };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorldP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldP;\nuniform sampler2D uLayout;\nuniform float uLayoutSize;')
      .replace('#include <map_fragment>', `
        vec2 luv = vWorldP.xz / uLayoutSize + 0.5;
        vec3 lay = texture2D(uLayout, vec2(luv.x, 1.0 - luv.y)).rgb;
        lay = pow(lay, vec3(2.2));
        float dt = texture2D(map, vWorldP.xz * 0.25).r * 0.55 + texture2D(map, vWorldP.xz * 0.031).r * 0.65;
        diffuseColor.rgb *= lay * (0.62 + dt * 0.5);
      `);
  };
  mat.customProgramCacheKey = () => 'ground-v1';
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.name = 'ground';
  return m;
}

function makeScenery(scene) {
  const group = new THREE.Group();
  // Mountains ring
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x5b7a8f, roughness: 1, flatShading: true });
  const snowMat = new THREE.MeshStandardMaterial({ color: 0xe8f0f6, roughness: 1, flatShading: true });
  for (let i = 0; i < 46; i++) {
    const a = (i / 46) * Math.PI * 2 + Math.random() * 0.08;
    if (Math.abs(Math.sin(a)) < 0.25 && Math.cos(a) > 0) continue; // gap for city
    const r = 780 + Math.random() * 320;
    const h = 120 + Math.random() * 260;
    const geo = new THREE.ConeGeometry(110 + Math.random() * 140, h, 5 + ((Math.random() * 3) | 0), 1);
    const m = new THREE.Mesh(geo, mtnMat);
    m.position.set(Math.cos(a) * r, h / 2 - 8, Math.sin(a) * r);
    m.rotation.y = Math.random() * 3;
    group.add(m);
    if (h > 260) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(geo.parameters.radius * 0.28, h * 0.28, geo.parameters.radialSegments, 1), snowMat);
      cap.position.set(m.position.x, h - 8 - h * 0.14 + 0.5, m.position.z);
      cap.rotation.y = m.rotation.y;
      group.add(cap);
    }
  }
  // City skyline (east)
  const bMat = new THREE.MeshStandardMaterial({ color: 0x8a9cb0, roughness: 0.6, metalness: 0.2 });
  const winMat = new THREE.MeshStandardMaterial({ color: 0x9fb4c8, roughness: 0.3, metalness: 0.5 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 70; i++) {
    const w = 18 + Math.random() * 30, d = 18 + Math.random() * 30, h = 40 + Math.random() * 220;
    const m = new THREE.Mesh(box, Math.random() < 0.5 ? bMat : winMat);
    m.scale.set(w, h, d);
    m.position.set(560 + Math.random() * 260, h / 2, (Math.random() - 0.5) * 520);
    group.add(m);
  }
  scene.add(group);
  return group;
}

export function makeObstacles(scene) {
  const list = [];
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.7 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x00aeef, roughness: 0.5, emissive: 0x004466, emissiveIntensity: 0.6 });
  const coverMat = new THREE.MeshStandardMaterial({ color: 0xb5bcc4, roughness: 0.85 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.6 });
  // perimeter pillars
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 10;
    const r = 66, rad = 2.2, h = 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * 1.08, h, 24), pillarMat);
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    for (const y of [3, h - 2]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.05, rad * 1.05, 0.6, 24), bandMat);
      b.position.set(x, y, z); scene.add(b);
    }
    list.push({ type: 'cyl', x, z, r: rad, h });
  }
  // sparse low cover (keeps the middle flat and open)
  const covers = [[-22, -14, 7, 1.3, 1.4, 0.3], [22, 14, 7, 1.3, 1.4, 0.3], [22, -14, 1.4, 1.3, 7, 0], [-22, 14, 1.4, 1.3, 7, 0], [0, -30, 9, 1.6, 1.4, 0], [0, 30, 9, 1.6, 1.4, 0]];
  for (const [x, z, w, h, d] of covers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), coverMat);
    m.position.set(x, h / 2, z); m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.12, d + 0.1), capMat);
    cap.position.set(x, h + 0.06, z); scene.add(cap);
    list.push({ type: 'box', min: new THREE.Vector3(x - w / 2, 0, z - d / 2), max: new THREE.Vector3(x + w / 2, h, z + d / 2) });
  }
  return list;
}

export class Arena {
  constructor(scene, renderer) {
    this.scene = scene;
    // everything the arena adds lives under root, so another map can hide it
    const root = this.root = new THREE.Group();
    root.name = 'arena';
    scene.add(root);
    this.config = TRAINING;
    this.sunDir = new THREE.Vector3(0.45, 0.78, 0.33).normalize();
    this.fog = new THREE.Fog(0x8fb8e6, 220, 1500);
    this.sky = makeSky(this.sunDir);
    root.add(this.sky);
    this.ground = makeGround();
    root.add(this.ground);
    makeScenery(root);
    this.obstacles = makeObstacles(root);
    // lights
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x5d5448, 0.85);
    root.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffeccc, 2.7);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -40; sc.right = 40; sc.top = 40; sc.bottom = -40; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    root.add(this.sun, this.sun.target);
    this.setShadowRes(renderer ? renderer.q.shadow : 2048);
    // environment for reflections
    if (renderer) {
      const pm = new THREE.PMREMGenerator(renderer.r);
      const envScene = new THREE.Scene();
      const skyClone = makeSky(this.sunDir);
      skyClone.scale.setScalar(100);
      skyClone.material.depthTest = false;
      skyClone.material.uniforms.uSunDisc.value = 0; // no HDR sun in reflections (avoids specular glitter)
      envScene.add(skyClone);
      const groundEnv = new THREE.Mesh(new THREE.CircleGeometry(90, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x8e979f }));
      groundEnv.position.y = -2; envScene.add(groundEnv);
      this.envRT = pm.fromScene(envScene, 0.03);
      pm.dispose();
    }
    this.activate(true);
  }
  /** show or hide the arena; when shown it also owns the scene's fog and reflections */
  activate(on) {
    this.root.visible = on;
    if (!on) return;
    const s = this.scene;
    s.background = null;
    s.fog = this.fog;
    s.environment = this.envRT ? this.envRT.texture : null;
    s.environmentIntensity = 0.4;
  }
  setShadowRes(n) {
    this.sun.shadow.mapSize.set(n, n);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }
  update(dt, time, focus) {
    this.sky.material.uniforms.uTime.value = time;
    // keep shadow frustum centred on the action
    const f = focus || new THREE.Vector3();
    const snap = 2;
    const fx = Math.round(f.x / snap) * snap, fz = Math.round(f.z / snap) * snap;
    const fy = Math.max(0, Math.min(f.y, 60));
    this.sun.target.position.set(fx, fy * 0.5, fz);
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 130);
  }
}
