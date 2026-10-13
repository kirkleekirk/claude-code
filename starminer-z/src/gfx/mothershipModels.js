// The alien ship's models (see game/mothership.js), all built here: the saucer, the light it
// shines down, its drones, and the hall inside it with its core, shield and power nodes.
//
// Sizes are the ship's own, in blocks: its origin is the middle of the hall's floor (where you
// stand, over the hole the light comes up through), y up. The saucer is 49 across and 18 deep;
// the hall inside, 31 across and 7 high, sits wholly within it, so from outside you only ever
// see the hull, and from inside only the hall.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makePropMaterial, paint } from './propMaterial.js';

export const GREEN = new THREE.Color(0x46ff8c);

// ---- the saucer -------------------------------------------------------------------------------

// its outline, round from the shaft the light comes down to the top of the dome: (radius, height)
const HULL = [
  [1.6, -1.0], [1.6, -2.6], [3.6, -3.05], [9, -2.85], [15, -2.0], [20, -1.0], [23.5, 0.2], [24.6, 1.0], [24.6, 1.6],
  [23.5, 2.4], [19, 4.0], [17.6, 6.0], [17.4, 8.8], [12, 9.4], [9.4, 9.6],
];
const DOME = [[9.4, 9.6], [8.4, 11.6], [6.4, 13.2], [3.5, 14.2], [0.01, 14.6]];

const lathe = (pts, segs) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);

// The lights: dots round the rim and round the underside, lit in a chase, and the ring round
// the shaft; one geometry, each dot knowing its angle round the ship (aA) and its row (aR).
function lightDots() {
  const parts = [];
  const rows = [[24.75, 1.3, 40, 0.34], [13, -2.45, 24, 0.3], [6.5, -2.95, 16, 0.24]];
  rows.forEach(([r, y, n, s], row) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const g = new THREE.SphereGeometry(s, 8, 6).translate(Math.cos(a) * r, y, Math.sin(a) * r);
      const k = g.attributes.position.count;
      g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(k).fill(a), 1));
      g.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(k).fill(row), 1));
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      parts.push(g);
    }
  });
  const ring = new THREE.TorusGeometry(2.1, 0.22, 8, 40).rotateX(Math.PI / 2).translate(0, -2.75, 0);
  const k = ring.attributes.position.count;
  ring.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(k), 1));
  ring.setAttribute('aR', new THREE.BufferAttribute(new Float32Array(k).fill(3), 1));
  ring.deleteAttribute('uv');
  ring.deleteAttribute('normal');
  parts.push(ring);
  return mergeGeometries(parts);
}

function glowMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aA; attribute float aR;
      varying float vA; varying float vR;
      void main() { vA = aA; vR = aR; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uPower; uniform vec3 uColor; uniform float uAlarm;
      varying float vA; varying float vR;
      void main() {
        // a chase round each row, the rows the opposite ways; the ring round the shaft steady
        float dir = mod(vR, 2.0) < 0.5 ? 1.0 : -1.0;
        float p = 0.5 + 0.5 * sin(vA * 6.0 - uTime * 3.0 * dir);
        float k = vR > 2.5 ? 0.9 : 0.25 + 0.75 * pow(p, 3.0);
        vec3 c = mix(uColor, vec3(1.0, 0.18, 0.12), uAlarm * step(0.5, fract(uTime * 1.6)));
        gl_FragColor = vec4(c * k * 3.2 * uPower, 1.0);
      }`,
  });
}

// The hull's plates, in rings round it: darker underneath, paler round the rim
function plates(geo) {
  const P = geo.attributes.position, col = geo.attributes.color, mat = geo.attributes.aMat, c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z);
    if (y < 0.5) c.setHex(Math.floor(r / 3) % 2 ? 0x454e54 : 0x3a4247);
    else if (r > 22) c.setHex(0x8b959b);
    else c.setHex(Math.floor(r / 4) % 2 ? 0x5d666c : 0x535b61);
    col.setXYZ(i, c.r, c.g, c.b);
    mat.setX(i, 0.55);
  }
  return geo;
}

export function makeShip(app) {
  const mat = makePropMaterial(app.sky.uniforms, app.terrain.uniforms, { noFog: true });
  mat.uniforms.uObjLight.value.set(1, 0);
  const hull = plates(paint(lathe(HULL, 72), 0x5d666c, 0.55, 0));
  // the bands where the hull's plates meet: darker rings; and lit rings across its underside
  const bands = [[18.6, 4.3], [12.6, 9.42], [24.62, 1.0]].map(([r, y]) => paint(new THREE.TorusGeometry(r, 0.18, 6, 72).rotateX(Math.PI / 2).translate(0, y, 0), 0x22282b, 0.7, 0));
  const under = [[4.6, -3.0], [9.5, -2.83], [15.5, -1.93], [20.5, -0.86]].map(([r, y]) => paint(new THREE.TorusGeometry(r, 0.09, 4, 96).rotateX(Math.PI / 2).translate(0, y - 0.06, 0), 0x46ff8c, 0, 0.9));
  const dome = paint(lathe(DOME, 48), 0x2f8f63, 0.45, 0.32);
  const body = mergeGeometries([hull, ...bands, ...under, dome]);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(body, mat));
  const uniforms = { uTime: { value: 0 }, uPower: { value: 1 }, uColor: { value: GREEN.clone() }, uAlarm: { value: 0 } };
  const lights = new THREE.Mesh(lightDots(), glowMaterial(uniforms));
  group.add(lights);
  group.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return {
    group, mat, uniforms,
    dispose() { body.dispose(); mat.dispose(); lights.geometry.dispose(); lights.material.dispose(); group.removeFromParent(); },
  };
}

// ---- the light -------------------------------------------------------------------------------

// A cone from the ship's shaft to the ground (scaled to its length: the mesh's y runs 0 at the
// top to -1 at the bottom), bands of light running up it, brightest at its edges; and a pool of
// it on the ground, rings rippling out. (uInside: how far the eye is in it, where it's a faint
// glow all round instead: from in there it's all round, and would be a haze over everything.)
export function makeBeam() {
  const uniforms = { uTime: { value: 0 }, uAlpha: { value: 0 }, uLen: { value: 1 }, uInside: { value: 0 } };
  const cone = new THREE.CylinderGeometry(1.5, 3.1, 1, 40, 1, true).translate(0, -0.5, 0);
  const coneMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        vY = position.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAlpha; uniform float uLen; uniform float uInside;
      varying float vY; varying vec3 vN; varying vec3 vV;
      void main() {
        float along = -vY * uLen;
        float bands = 0.6 + 0.4 * sin(along * 1.3 + uTime * 7.0);
        float edge = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
        float ends = smoothstep(0.0, 0.04, -vY) * (1.0 - smoothstep(0.92, 1.0, -vY) * 0.6);
        // (from in it, no brighter at its sides: seen edge-on from near them, they'd be glare)
        float a = uAlpha * mix(0.22 + 0.8 * edge, 0.5, uInside) * bands * ends;
        gl_FragColor = vec4(vec3(0.3, 1.0, 0.55) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(cone, coneMat);
  beam.renderOrder = 18;
  beam.frustumCulled = false;
  const disc = new THREE.CircleGeometry(5.5, 48).rotateX(-Math.PI / 2);
  const discMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uAlpha; varying vec2 vP;
      void main() {
        float r = length(vP) / 5.5;
        float rings = 0.55 + 0.45 * sin(r * 22.0 - uTime * 4.0);
        float a = uAlpha * (1.0 - smoothstep(0.35, 1.0, r)) * (0.35 + 0.4 * rings);
        gl_FragColor = vec4(vec3(0.3, 1.0, 0.55) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pool = new THREE.Mesh(disc, discMat);
  pool.renderOrder = 18;
  return {
    beam, pool, uniforms,
    dispose() { cone.dispose(); coneMat.dispose(); disc.dispose(); discMat.dispose(); beam.removeFromParent(); pool.removeFromParent(); },
  };
}

// ---- a drone -----------------------------------------------------------------------------------

// A pod three blocks across and two high above the ground (its origin at the middle of its foot,
// on the ground), its spike below going into the ground, fins at its corners, a lit band round
// it, and on its top, its eye (the part to shoot): a glowing ball, apart so it can change colour.
export const DRONE_EYE_Y = 2.42;
let DRONE_GEO = null;
function droneGeometry() {
  if (DRONE_GEO) return DRONE_GEO;
  const oct = (r, h, y) => new THREE.CylinderGeometry(r, r, h, 8, 1).rotateY(Math.PI / 8).translate(0, y, 0);
  const parts = [
    paint(oct(1.62, 2, 1), 0x3d484b, 0.8, 0),
    paint(oct(1.4, 0.14, 2.06), 0x5d6c71, 0.85, 0),
    paint(oct(1.66, 0.22, 1.32), 0x46ff8c, 0, 1),
    paint(new THREE.ConeGeometry(1.3, 2.4, 8).rotateX(Math.PI).rotateY(Math.PI / 8).translate(0, -1.2, 0), 0x2c3537, 0.8, 0),
    paint(new THREE.CylinderGeometry(0.22, 0.32, 0.22, 10).translate(0, 2.22, 0), 0x2c3537, 0.8, 0),
  ];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    parts.push(paint(new THREE.BoxGeometry(0.12, 1.5, 1.0).translate(0, 0.9, 0.45).rotateX(0.25).translate(0, 0, 1.45).rotateY(a), 0x2c3537, 0.8, 0));
  }
  DRONE_GEO = { body: mergeGeometries(parts), eye: paint(new THREE.SphereGeometry(0.42, 16, 12), 0xffffff, 0, 1) };
  return DRONE_GEO;
}

export function makeDrone(app) {
  const G = droneGeometry();
  const mat = makePropMaterial(app.sky.uniforms, app.terrain.uniforms, {});
  const eyeMat = makePropMaterial(app.sky.uniforms, app.terrain.uniforms, {});
  eyeMat.uniforms.uTint.value.copy(GREEN);
  const group = new THREE.Group();
  const body = new THREE.Mesh(G.body, mat);
  const eye = new THREE.Mesh(G.eye, eyeMat);
  eye.position.y = DRONE_EYE_Y;
  group.add(body, eye);
  return {
    group, eye, mat, eyeMat,
    setLight(sky, block) { mat.uniforms.uObjLight.value.set(sky, block); eyeMat.uniforms.uObjLight.value.set(sky, block); },
    dispose() { mat.dispose(); eyeMat.dispose(); group.removeFromParent(); },
  };
}

// ---- inside ------------------------------------------------------------------------------------

// The hall: a face for every side of its hull's blocks that looks into the room (solid: the
// solid cells, as 'x,y,z' from the cell the light comes up through, the floor's cells at y -1;
// open(x, y, z): is that cell the room's), each knowing what it is (aK: 0 floor, 1 wall, 2
// ceiling) for its lighting. The mesh's origin is the middle of that cell's top.
export function makeHall(solid, open) {
  const pos = [], nrm = [], kind = [];
  const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  for (const key of solid) {
    const [x, y, z] = key.split(',').map(Number);
    DIRS.forEach(([dx, dy, dz], d) => {
      if (!open(x + dx, y + dy, z + dz)) return;
      // the face on the side toward (dx, dy, dz), wound to face it
      const c = [x + dx * 0.5, y + 0.5 + dy * 0.5, z + dz * 0.5];
      const ax = d >> 1;
      const u = ax === 0 ? [0, 1, 0] : ax === 1 ? [0, 0, 1] : [1, 0, 0];
      const v = [dy * u[2] - dz * u[1], dz * u[0] - dx * u[2], dx * u[1] - dy * u[0]];
      const corner = (su, sv) => [c[0] + (u[0] * su + v[0] * sv) * 0.5, c[1] + (u[1] * su + v[1] * sv) * 0.5, c[2] + (u[2] * su + v[2] * sv) * 0.5];
      const q = [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)];
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(...q[i]); nrm.push(dx, dy, dz); kind.push(dy > 0 ? 0 : dy < 0 ? 2 : 1); }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('aK', new THREE.Float32BufferAttribute(kind, 1));
  const uniforms = { uTime: { value: 0 }, uCore: { value: 1 }, uCoreY: { value: 4.5 }, uAlarm: { value: 0 } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float aK; varying vec3 vP; varying vec3 vN; varying float vK;
      void main() { vP = position; vN = normal; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uCore; uniform float uCoreY; uniform float uAlarm;
      varying vec3 vP; varying vec3 vN; varying float vK;
      void main() {
        // a metre's grid of plates, dark, with fine lit seams between them (on the blocks' edges)
        vec2 g = abs(vN.y) > 0.5 ? vP.xz + 0.5 : abs(vN.x) > 0.5 ? vec2(vP.z + 0.5, vP.y) : vec2(vP.x + 0.5, vP.y);
        vec2 f = abs(fract(g) - 0.5);
        float seam = smoothstep(0.47, 0.5, max(f.x, f.y));
        vec3 base = vK < 0.5 ? vec3(0.085, 0.1, 0.105) : vK < 1.5 ? vec3(0.12, 0.135, 0.14) : vec3(0.06, 0.07, 0.075);
        float r = length(vP.xz);
        // light from the core over the middle (dim once it's gone), and a little everywhere
        vec3 toCore = vec3(0.0, uCoreY, 0.0) - vP;
        float dc = length(toCore);
        float face = max(dot(normalize(vN), toCore / max(dc, 0.001)), 0.0) * 0.8 + 0.2;
        vec3 light = vec3(0.35, 1.0, 0.6) * face * (3.5 / (1.0 + dc * dc * 0.03)) * mix(0.15, 1.0, uCore) + vec3(0.25, 0.3, 0.32);
        vec3 col = base * light;
        col += vec3(0.08, 0.5, 0.22) * seam * 0.35;
        // a lit strip round the wall at waist height, and the light round the floor's edge and
        // round the hole; red, flashing, when the alarm's going
        vec3 strip = mix(vec3(0.3, 1.0, 0.55), vec3(1.0, 0.2, 0.15) * step(0.5, fract(uTime * 1.6)), uAlarm);
        if (vK > 0.5 && vK < 1.5) col += strip * (1.0 - smoothstep(0.03, 0.07, abs(vP.y - 1.05))) * 1.6;
        if (vK < 0.5) {
          col += strip * (1.0 - smoothstep(0.05, 0.12, abs(r - 13.4))) * 1.2;
          col += vec3(0.3, 1.0, 0.55) * (1.0 - smoothstep(0.04, 0.1, abs(r - 2.4))) * (0.6 + 0.4 * sin(uTime * 3.0));
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  return { mesh, uniforms, dispose() { g.dispose(); mat.dispose(); mesh.removeFromParent(); } };
}

// The core: a crystal of light over the hole, turning, held from the ceiling; its shield, a
// bubble round it while the power nodes stand; and the nodes' crystals, each with a line of power
// to the core.
export function makeCore(nodes) {
  const uniforms = { uTime: { value: 0 }, uHit: { value: 0 }, uShield: { value: 1 }, uDim: { value: 0 } };
  const glow = (vs, fs, extra = {}) => new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, ...extra });
  const VS = /* glsl */ `
    varying vec3 vN; varying vec3 vV; varying vec3 vL;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vN = normalize(mat3(modelMatrix) * normal); vV = normalize(cameraPosition - w.xyz); vL = position;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`;
  const crystal = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 1), glow(VS, /* glsl */ `
    uniform float uTime; uniform float uHit; uniform float uDim; varying vec3 vN; varying vec3 vV;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 2.0);
      vec3 c = mix(vec3(0.35, 1.0, 0.6), vec3(0.85, 1.0, 0.9), rim) * (1.05 + 0.3 * sin(uTime * 5.0));
      c = mix(c, vec3(1.0, 0.35, 0.25) * 2.5, uHit);
      gl_FragColor = vec4(c * (1.0 - uDim * 0.92), 1.0);
    }`));
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), glow(VS, /* glsl */ `
    uniform float uDim; varying vec3 vN; varying vec3 vV;
    void main() { float a = pow(1.0 - abs(dot(normalize(vN), vV)), 3.0) * 0.8 * (1.0 - uDim); gl_FragColor = vec4(vec3(0.3, 1.0, 0.55) * a, a); }`,
  { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, wireframe: true }));
  const shield = new THREE.Mesh(new THREE.SphereGeometry(2.7, 32, 18), glow(VS, /* glsl */ `
    uniform float uTime; uniform float uShield; uniform float uHit; varying vec3 vN; varying vec3 vV; varying vec3 vL;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vN), vV)), 2.5);
      float cells = 0.5 + 0.5 * sin(vL.x * 6.0 + uTime) * sin(vL.y * 6.0 - uTime * 0.7) * sin(vL.z * 6.0);
      float a = uShield * (0.04 + 0.42 * rim) * (0.7 + 0.3 * cells) + uShield * uHit * 0.35;
      gl_FragColor = vec4(vec3(0.35, 1.0, 0.6) * a, a);
    }`, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  shield.renderOrder = 18;
  shell.renderOrder = 18;
  const group = new THREE.Group();
  group.add(crystal, shell, shield);
  // what holds it up: four struts to the ceiling
  const strutMat = makeStrutMaterial();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2 + Math.PI / 4;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, 3.2, 6), strutMat);
    s.position.set(Math.cos(a) * 1.6, 1.9, Math.sin(a) * 1.6);
    s.lookAt(Math.cos(a) * 2.6, 3.5, Math.sin(a) * 2.6);
    s.rotateX(Math.PI / 2);
    group.add(s);
  }
  // the nodes: a crystal on each pillar, and its line of power to the core
  const nodeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46ff8c).multiplyScalar(2.2) });
  const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46ff8c).multiplyScalar(1.4), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
  const nodeMeshes = nodes.map(([x, y, z]) => {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.48, 0), nodeMat.clone());
    m.position.set(x, y, z);
    const to = new THREE.Vector3(0, 0, 0);
    const from = new THREE.Vector3(x, y, z);
    const len = from.distanceTo(to);
    const line = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, len, 5, 1, true).translate(0, len / 2, 0).rotateX(Math.PI / 2), lineMat);
    line.renderOrder = 18;
    return { crystal: m, line, from, len };
  });
  return {
    group, uniforms, crystal, shell, shield, nodes: nodeMeshes,
    dispose() {
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); } });
      for (const n of nodeMeshes) { n.crystal.geometry.dispose(); n.crystal.material.dispose(); n.line.geometry.dispose(); n.crystal.removeFromParent(); n.line.removeFromParent(); }
      crystal.material.dispose(); shell.material.dispose(); shield.material.dispose(); strutMat.dispose(); nodeMat.dispose(); lineMat.dispose();
      group.removeFromParent();
    },
  };
}

function makeStrutMaterial() { return new THREE.MeshBasicMaterial({ color: 0x1c2224 }); }

// The core's shot: a ball of green light.
export function makeBoltParts() {
  const geo = new THREE.SphereGeometry(0.24, 10, 8);
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dffad).multiplyScalar(2.4) });
  return { geo, mat, dispose() { geo.dispose(); mat.dispose(); } };
}
