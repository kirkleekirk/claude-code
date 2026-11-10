import * as THREE from 'three';
import { Geo, M, temp } from '../gfx/geo.js';
import { litMaterial } from '../gfx/materials.js';

// Colour schemes per frame tier: [shell, trim, undersuit, glow]
const PALETTES = [
  { shell: [0.6, 0.62, 0.66], trim: [0.92, 0.42, 0.1], under: [0.07, 0.08, 0.1], glow: [0.35, 0.95, 1.0], metal: 0.12, bulk: 0 },
  { shell: [0.27, 0.28, 0.31], trim: [0.6, 0.35, 0.18], under: [0.06, 0.06, 0.07], glow: [1.0, 0.62, 0.2], metal: 0.5, bulk: 0.5 },
  { shell: [0.08, 0.17, 0.44], trim: [0.78, 0.8, 0.85], under: [0.05, 0.06, 0.09], glow: [0.45, 0.8, 1.0], metal: 0.6, bulk: 1 },
  { shell: [0.8, 0.8, 0.78], trim: [0.85, 0.6, 0.2], under: [0.09, 0.09, 0.11], glow: [0.55, 1.0, 0.9], metal: 0.55, bulk: 0.8 },
  { shell: [0.06, 0.05, 0.09], trim: [0.42, 0.22, 0.78], under: [0.03, 0.03, 0.05], glow: [0.6, 0.5, 1.0], metal: 0.7, bulk: 1 },
];

const col = (c, glow = 0) => (p, n, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = glow; };
function box(g, w, h, d, x, y, z, c, glow = 0, rx = 0, ry = 0, rz = 0) {
  g.add(temp(new THREE.BoxGeometry(w, h, d)), M.trs(x, y, z, rx, ry, rz), col(c, glow), true);
}
function cap(g, r, len, x, y, z, c, sides = 8, rx = 0, rz = 0) {
  g.add(temp(new THREE.CapsuleGeometry(r, len, 3, sides)), M.trs(x, y, z, rx, 0, rz), col(c));
}
function cyl(g, rt, rb, h, x, y, z, c, glow = 0, sides = 10, rx = 0, rz = 0) {
  g.add(temp(new THREE.CylinderGeometry(rt, rb, h, sides)), M.trs(x, y, z, rx, 0, rz), col(c, glow));
}
function ball(g, r, x, y, z, c, glow = 0, sx = 1, sy = 1, sz = 1) {
  g.add(temp(new THREE.SphereGeometry(r, 12, 9)), M.trs(x, y, z, 0, 0, 0, sx, sy, sz), col(c, glow));
}

// Builds the articulated suit. Faces +Z. Origin at the feet.
export function buildSuit(tier = 0, gear = {}) {
  const P = PALETTES[tier];
  const b = P.bulk;
  const mat = litMaterial({ metal: P.metal, spec: 0.9, shin: 55, wrap: 0.25, glow: 2.0, rim: 0.35, rimCol: 0x8fd8ff, nightBoost: 0.2 });
  const mk = (geo) => { const m = new THREE.Mesh(geo.build(), mat); m.frustumCulled = false; return m; };
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.98; root.add(hips);

  // pelvis
  let g = new Geo();
  box(g, 0.34 + b * 0.03, 0.2, 0.23, 0, 0, 0, P.under);
  box(g, 0.36 + b * 0.04, 0.09, 0.25, 0, 0.07, 0, P.shell);
  box(g, 0.12, 0.12, 0.05, 0, 0.0, 0.12, P.trim);
  if (tier >= 1) { box(g, 0.1, 0.2, 0.2, -0.2, -0.04, 0, P.shell, 0, 0, 0, 0.15); box(g, 0.1, 0.2, 0.2, 0.2, -0.04, 0, P.shell, 0, 0, 0, -0.15); }
  hips.add(mk(g));

  // torso
  const torso = new THREE.Group(); torso.position.y = 0.1; hips.add(torso);
  g = new Geo();
  g.add(temp(new THREE.CylinderGeometry(0.165, 0.15, 0.24, 10)), M.trs(0, 0.12, 0, 0, 0, 0, 1, 1, 0.72), col(P.under));
  g.add(temp(new THREE.CylinderGeometry(0.215 + b * 0.02, 0.17, 0.36, 10)), M.trs(0, 0.42, 0, 0, 0, 0, 1, 1, 0.74), col(P.shell));
  box(g, 0.3 + b * 0.04, 0.2, 0.1, 0, 0.47, 0.115 + b * 0.02, tier >= 1 ? P.shell : P.under, 0, -0.14);
  box(g, 0.25, 0.1, 0.09, 0, 0.32, 0.12, P.trim, 0, 0.12);
  cyl(g, 0.058, 0.058, 0.035, 0, 0.47, 0.178 + b * 0.02, P.glow, 1, 12, Math.PI / 2);
  g.add(temp(new THREE.TorusGeometry(0.075, 0.016, 5, 14)), M.trs(0, 0.47, 0.172 + b * 0.02), col(P.trim));
  g.add(temp(new THREE.TorusGeometry(0.105, 0.03, 6, 14).rotateX(Math.PI / 2)), M.trs(0, 0.62, 0), col(P.under));
  for (const sx of [-1, 1]) box(g, 0.025, 0.2, 0.02, sx * 0.1, 0.24, 0.125, P.glow, 0.8);
  // pack
  box(g, 0.3, 0.36, 0.13, 0, 0.42, -0.19, P.shell);
  box(g, 0.22, 0.05, 0.14, 0, 0.56, -0.19, P.trim);
  box(g, 0.05, 0.22, 0.02, 0, 0.4, -0.262, P.glow, 0.7);
  if (tier >= 3) {
    for (const sx of [-1, 1]) {
      cyl(g, 0.055, 0.075, 0.3, sx * 0.14, 0.34, -0.29, P.trim, 0, 8, 0.25);
      cyl(g, 0.06, 0.06, 0.03, sx * 0.14, 0.2, -0.327, P.glow, 1, 8, 0.25);
      box(g, 0.03, 0.3, 0.26, sx * 0.25, 0.5, -0.32, P.shell, 0, -0.5, 0, sx * -0.45);
      box(g, 0.012, 0.26, 0.04, sx * 0.265, 0.5, -0.44, P.glow, 0.8, -0.5, 0, sx * -0.45);
    }
  } else if (tier >= 1) {
    for (const sx of [-1, 1]) cyl(g, 0.04, 0.05, 0.22, sx * 0.1, 0.32, -0.27, P.trim, 0, 8);
  } else {
    cyl(g, 0.012, 0.012, 0.34, 0.12, 0.76, -0.2, P.under, 0, 5);
    ball(g, 0.025, 0.12, 0.94, -0.2, P.glow, 1);
  }
  if (tier === 4) for (const sx of [-1, 1]) { box(g, 0.02, 0.3, 0.02, sx * 0.17, 0.42, 0.13, P.glow, 1, -0.14, 0, sx * 0.3); }
  torso.add(mk(g));

  // head
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  g = new Geo();
  ball(g, 0.155, 0, 0.13, 0, P.shell, 0, 1, 1.08, 1.06);
  g.add(temp(new THREE.SphereGeometry(0.159, 14, 8, Math.PI * 0.14, Math.PI * 0.72, Math.PI * 0.3, Math.PI * 0.3)), M.trs(0, 0.13, 0.008, 0, 0, 0, 1, 1.08, 1.06), col(P.glow, tier === 0 ? 0.55 : 0.9));
  for (const sx of [-1, 1]) cyl(g, 0.045, 0.045, 0.04, sx * 0.155, 0.12, 0, P.trim, 0, 10, 0, Math.PI / 2);
  box(g, 0.05, 0.2, 0.2, 0, 0.22, -0.04, P.trim, 0, -0.5);
  if (tier >= 2) for (const sx of [-1, 1]) box(g, 0.02, 0.12, 0.1, sx * 0.13, 0.25, -0.05, P.shell, 0, -0.4, 0, sx * -0.3);
  cyl(g, 0.07, 0.085, 0.07, 0, -0.01, 0, P.under, 0, 10);
  head.add(mk(g));

  // arms
  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.275, 0.53, 0); torso.add(sh);
    let a = new Geo();
    ball(a, 0.095 + b * 0.025, 0, 0, 0, P.shell, 0, 1.05, 0.95, 1.05);
    if (tier >= 1) box(a, 0.14 + b * 0.05, 0.05, 0.2, sx * 0.03, 0.07, 0, P.trim, 0, 0, 0, sx * -0.35);
    cap(a, 0.055, 0.2, 0, -0.17, 0, P.under);
    if (tier >= 1) box(a, 0.1, 0.16, 0.12, sx * 0.012, -0.16, 0, P.shell);
    sh.add(mk(a));
    const fore = new THREE.Group(); fore.position.y = -0.31; sh.add(fore);
    a = new Geo();
    ball(a, 0.058, 0, 0, 0, P.under);
    const right = sx < 0;        // the model faces +Z, so its right hand is on -X
    const gr = right && gear.gauntlet ? 0.078 : 0.062;
    cyl(a, gr, 0.055, 0.22, 0, -0.15, 0, right && gear.gauntlet ? P.trim : P.shell, 0, 10);
    box(a, 0.02, 0.16, 0.02, sx * (gr - 0.004), -0.15, 0, P.glow, 0.9);
    if (right && gear.gauntlet) {
      a.add(temp(new THREE.TorusGeometry(gr + 0.004, 0.014, 5, 14).rotateX(Math.PI / 2)), M.trs(0, -0.24, 0), col(P.glow, 1));
      cyl(a, 0.03, 0.045, 0.06, 0, -0.3, 0.055, P.under, 0, 8);
      cyl(a, 0.024, 0.024, 0.02, 0, -0.335, 0.055, P.glow, 1, 8);
    }
    box(a, 0.075, 0.1, 0.05, 0, -0.31, 0, P.under);
    fore.add(mk(a));
    return { sh, fore };
  };
  const L = arm(1), R = arm(-1);

  // legs
  const leg = (sx) => {
    const hip = new THREE.Group(); hip.position.set(sx * 0.105, -0.07, 0); hips.add(hip);
    let a = new Geo();
    cap(a, 0.082, 0.28, 0, -0.21, 0, P.under);
    if (tier >= 1) box(a, 0.13 + b * 0.02, 0.26, 0.1, sx * 0.02, -0.2, 0.045, P.shell);
    else box(a, 0.03, 0.2, 0.02, sx * 0.085, -0.2, 0, P.trim);
    hip.add(mk(a));
    const shin = new THREE.Group(); shin.position.y = -0.44; hip.add(shin);
    a = new Geo();
    ball(a, 0.075, 0, 0, 0.01, tier >= 1 ? P.trim : P.under);
    cap(a, 0.064, 0.26, 0, -0.2, 0, P.under);
    box(a, 0.11 + b * 0.02, 0.28, 0.09, 0, -0.2, 0.04, P.shell);
    box(a, 0.02, 0.2, 0.012, 0, -0.2, 0.09, P.glow, 0.7);
    box(a, 0.115, 0.1, 0.27, 0, -0.42, 0.045, P.shell);
    box(a, 0.12, 0.035, 0.28, 0, -0.475, 0.045, P.under);
    if (gear.boots) { box(a, 0.125, 0.02, 0.24, 0, -0.455, 0.045, P.glow, 1); cyl(a, 0.03, 0.04, 0.05, 0, -0.38, -0.11, P.glow, 0.8, 8); }
    shin.add(mk(a));
    return { hip, shin };
  };
  const LL = leg(1), RL = leg(-1);

  // thruster flames (additive cones), hidden unless thrusting
  const flameMat = new THREE.ShaderMaterial({
    vertexShader: `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uCol; uniform float uPow; varying float vY; void main(){ float t = clamp(vY + 1.0, 0.0, 1.0); gl_FragColor = vec4(mix(uCol, vec3(1.0), t * t) * t * uPow * 3.0, 1.0); }`,
    uniforms: { uCol: { value: new THREE.Color(P.glow[0], P.glow[1], P.glow[2]) }, uPow: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flames = [];
  const flameGeo = new THREE.ConeGeometry(0.07, 1, 8, 1, true).rotateX(Math.PI).translate(0, -0.5, 0);
  const addFlame = (parent, x, y, z) => { const m = new THREE.Mesh(flameGeo, flameMat); m.position.set(x, y, z); m.visible = false; parent.add(m); flames.push(m); };
  if (tier >= 3) { addFlame(torso, 0.14, 0.02, -0.34); addFlame(torso, -0.14, 0.02, -0.34); }
  addFlame(LL.shin, 0, -0.47, 0.02); addFlame(RL.shin, 0, -0.47, 0.02);

  // contact shadow blob
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform float uA; varying vec2 vU; void main(){ float d = length(vU - 0.5) * 2.0; gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - d) * (1.0 - d) * uA); }`,
    uniforms: { uA: { value: 0.55 } }, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  blob.renderOrder = 2;

  return {
    root, hips, torso, head, armL: L.sh, foreL: L.fore, armR: R.sh, foreR: R.fore, legL: LL.hip, shinL: LL.shin, legR: RL.hip, shinR: RL.shin,
    flames, flameMat, blob, mat, tier, phase: 0, aimBlend: 0, airBlend: 0, hoverBlend: 0, kick: 0,
    muzzle: new THREE.Vector3(),
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const damp = (cur, target, rate, dt) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

// Procedural animation. s: { speed, onGround, vy, aiming, aimPitch, hover, thrust, time, sprint, dead }
export function animateSuit(rig, s, dt) {
  const run = Math.min(1, s.speed / 6.5);
  rig.phase += s.speed * (s.onGround ? 1.75 : 0.4) * dt;
  rig.aimBlend = damp(rig.aimBlend, s.aiming ? 1 : 0, 14, dt);
  rig.airBlend = damp(rig.airBlend, s.onGround ? 0 : 1, 10, dt);
  rig.hoverBlend = damp(rig.hoverBlend, s.hover ? 1 : 0, 8, dt);
  rig.kick = Math.max(0, rig.kick - dt * 9);
  const ph = rig.phase, A = run * 0.8, air = rig.airBlend, hov = rig.hoverBlend;
  const breathe = Math.sin(s.time * 1.6) * 0.012;
  const sw = Math.sin(ph), cw = Math.cos(ph);

  rig.hips.position.y = 0.98 + Math.abs(cw) * 0.035 * run * (1 - air) - 0.03 * run + breathe * 0.4;
  rig.hips.rotation.y = sw * 0.12 * run * (1 - air);
  rig.torso.rotation.x = lerp(0.06 * run + (s.sprint ? 0.14 : 0) * run, 0.32, hov) + breathe;
  rig.torso.rotation.y = -sw * 0.14 * run * (1 - air) * (1 - rig.aimBlend);
  rig.head.rotation.x = lerp(-0.04 * run, -0.3, hov) + (s.aimPitch || 0) * 0.35 * rig.aimBlend;

  // legs: forward swing is negative X rotation
  const legPose = (hip, shin, k) => {
    const g1 = -Math.sin(ph + k) * A;
    const g2 = Math.max(0, Math.cos(ph + k)) * A * 1.25 + 0.06;
    const a1 = k === 0 ? -0.55 : 0.2, a2 = k === 0 ? 1.0 : 0.5;
    const h1 = 0.28 + (k === 0 ? 0.08 : -0.02), h2 = 0.25;
    hip.rotation.x = lerp(lerp(g1, a1, air), h1, hov);
    shin.rotation.x = lerp(lerp(g2, a2, air), h2, hov);
  };
  legPose(rig.legL, rig.shinL, 0);
  legPose(rig.legR, rig.shinR, Math.PI);

  // arms: counter-swing; right arm raises to aim
  const swingL = Math.sin(ph + Math.PI) * A * 0.75;
  const swingR = Math.sin(ph) * A * 0.75;
  rig.armL.rotation.x = lerp(lerp(-swingL, -0.5, air), 0.25, hov);
  rig.armL.rotation.z = lerp(0.1 + run * 0.05, 0.55, Math.max(air * 0.5, hov));
  rig.foreL.rotation.x = lerp(-0.3 - run * 0.55, -0.5, air);
  const aimX = -Math.PI / 2 + (s.aimPitch || 0) * 0.9 + rig.kick * 0.12;
  rig.armR.rotation.x = lerp(lerp(lerp(-swingR, -0.5, air), 0.25, hov), aimX, rig.aimBlend);
  rig.armR.rotation.z = lerp(lerp(-0.1 - run * 0.05, -0.55, Math.max(air * 0.5, hov)), -0.04, rig.aimBlend);
  rig.foreR.rotation.x = lerp(lerp(-0.3 - run * 0.55, -0.5, air), -0.08 - rig.kick * 0.2, rig.aimBlend);

  const pow = s.thrust || 0;
  rig.flameMat.uniforms.uPow.value = pow * (0.8 + 0.2 * Math.sin(s.time * 60));
  for (const f of rig.flames) { f.visible = pow > 0.02; f.scale.set(1 + pow * 0.5, 0.35 + pow * 0.9, 1 + pow * 0.5); }
  rig.foreR.updateWorldMatrix(true, false);
  rig.muzzle.set(0, -0.36, 0.055).applyMatrix4(rig.foreR.matrixWorld);
}
