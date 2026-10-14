// The exo suit (see game/exo.js) as Advanced Warfare's exos are: a dark alloy frame over the
// body. Struts run down the outside of the legs, with hinges at the hips, knees and ankles and a
// piston behind each calf. A spine of vertebrae runs up the back to a power unit with two
// thrusters under it, a yoke goes over the shoulders, the upper arms carry pauldrons and struts,
// and bracers sit on the forearms. Its power shows in cyan.
//
// It's built in the avatar's T-pose, the pose its mesh is modelled in (in the mesh's units,
// before the avatar's own scale), as parts for each bone they're fixed to. Each of those bones is
// one the mesh is skinned to, so the parts move as that part of the body does. The parts for a
// bone are one mesh, shared by every avatar wearing a suit.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { makePropMaterial, paint } from './propMaterial.js';

const FRAME = 0x30363c, STRUT = 0x3e454d, PLATE = 0x5a636d, JOINT = 0x202428, GLOW = 0x46e0ff, EMBER = 0xff9a3c;
// (a light line along a strut: what makes the frame show against whatever's worn under it)
const LIT = { r: 0, metal: 0, emi: 1.2 };

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const strip = (g) => {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  return g.index ? g.toNonIndexed() : g;
};
const place = (g, x, y, z, rx = 0, ry = 0, rz = 0) => g.applyMatrix4(_m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _one));
// a (rounded) box, w x h x d, at x, y, z, turned. (All metal, by default: a metal's reflection
// is in its own colour, so the dark alloy stays dark; half metal would mirror the sky, as blue
// as the clothes under it.)
const box = (w, h, d, at, color, { r = 0.006, rot = [0, 0, 0], metal = 0.95, emi = 0 } = {}) => {
  const rr = Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4);
  const g = strip(rr > 0.001 ? new RoundedBoxGeometry(w, h, d, 2, rr) : new THREE.BoxGeometry(w, h, d));
  return place(paint(g, color, metal, emi), ...at, ...rot);
};
// a cylinder (r0 at its top, r1 at its foot, along its axis: 'x', 'y' or 'z'), at x, y, z
const cyl = (r0, r1, len, axis, at, color, { metal = 0.95, emi = 0, seg = 14 } = {}) => {
  const g = strip(new THREE.CylinderGeometry(r0, r1, len, seg));
  const rot = axis === 'x' ? [0, 0, -Math.PI / 2] : axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return place(paint(g, color, metal, emi), ...at, ...rot);
};

// The left side's parts, by bone (the right's are these mirrored: x the other way, and so the
// turns about y and z); then the middle's, on the spine.
function leftParts() {
  return {
    // the upper arm (along +x in the T-pose): a pauldron over the shoulder (lit along its edge),
    // a strut behind
    SC_S: [
      box(0.125, 0.026, 0.13, [0.205, 1.11, -0.03], PLATE, { r: 0.009, rot: [0, 0, -0.12] }),
      box(0.1, 0.006, 0.008, [0.21, 1.115, 0.036], GLOW, { ...LIT, rot: [0, 0, -0.12] }),
      box(0.17, 0.028, 0.024, [0.245, 1.032, -0.1], FRAME),
      box(0.13, 0.006, 0.004, [0.245, 1.032, -0.113], GLOW, LIT),
    ],
    // the forearm: the elbow's hinge, a strut from it down the back of the arm, and the gauntlet
    // over the wrist end: in bands, with a plate on top and its light along that
    SC_E: [
      cyl(0.03, 0.03, 0.032, 'z', [0.345, 1.032, -0.095], JOINT),
      cyl(0.018, 0.018, 0.035, 'z', [0.345, 1.032, -0.095], GLOW, { metal: 0, emi: 1.2 }),
      box(0.07, 0.016, 0.014, [0.38, 1.032, -0.074], FRAME),
      box(0.105, 0.08, 0.086, [0.458, 1.033, -0.027], STRUT, { r: 0.016 }),
      ...[0.428, 0.488].map((x) => box(0.008, 0.086, 0.092, [x, 1.033, -0.027], JOINT, { r: 0.003 })),
      box(0.085, 0.01, 0.06, [0.458, 1.077, -0.027], PLATE),
      box(0.075, 0.004, 0.01, [0.458, 1.0835, -0.027], GLOW, LIT),
      box(0.06, 0.004, 0.006, [0.458, 1.033, 0.0175], GLOW, LIT),
    ],
    // the thigh: a strut down its outside (lit), a plate over its front
    SC_H: [
      box(0.03, 0.25, 0.046, [0.186, 0.515, -0.006], FRAME),
      box(0.004, 0.2, 0.007, [0.202, 0.515, -0.006], GLOW, LIT),
      box(0.1, 0.13, 0.022, [0.09, 0.53, 0.095], PLATE, { r: 0.008 }),
    ],
    // the shin: the knee's hinge (lit), a strut down its outside (lit), a piston behind the calf,
    // and a guard over the knee
    SC_K: [
      cyl(0.04, 0.04, 0.03, 'x', [0.192, 0.372, -0.02], JOINT),
      cyl(0.024, 0.024, 0.033, 'x', [0.193, 0.372, -0.02], GLOW, { metal: 0, emi: 1.2 }),
      box(0.03, 0.21, 0.046, [0.196, 0.255, -0.03], FRAME),
      box(0.004, 0.16, 0.007, [0.212, 0.25, -0.03], GLOW, LIT),
      cyl(0.014, 0.014, 0.17, 'y', [0.095, 0.255, -0.132], 0x8a939c),
      cyl(0.022, 0.022, 0.07, 'y', [0.095, 0.3, -0.132], FRAME),
      box(0.085, 0.065, 0.022, [0.095, 0.38, 0.076], PLATE),
    ],
    // the foot: the ankle's hinge and a plate behind the heel
    A: [
      cyl(0.032, 0.032, 0.026, 'x', [0.177, 0.085, -0.04], JOINT),
      box(0.11, 0.05, 0.018, [0.095, 0.06, -0.131], STRUT),
    ],
  };
}
const SIDE_BONE = { SC_S: 'SC_S', SC_E: 'SC_E', SC_H: 'SC_H', SC_K: 'SC_K', A: 'A' };

// the thrusters' nozzles, under the power unit on the back (SC_BACKB): their mouths, pointing down
export const NOZZLES = [new THREE.Vector3(0.06, 0.873, -0.155), new THREE.Vector3(-0.06, 0.873, -0.155)];

function middleParts() {
  // the belt: an ellipse round the waist, in short lengths
  const belt = [];
  const N = 18, a = 0.168, b = 0.128, y = 0.765, z0 = -0.004;
  for (let i = 0; i < N; i++) {
    const t0 = (i / N) * Math.PI * 2, t1 = ((i + 1) / N) * Math.PI * 2;
    const x0 = Math.cos(t0) * a, zz0 = Math.sin(t0) * b, x1 = Math.cos(t1) * a, zz1 = Math.sin(t1) * b;
    const len = Math.hypot(x1 - x0, zz1 - zz0) + 0.004;
    belt.push(box(len, 0.034, 0.014, [(x0 + x1) / 2, y, z0 + (zz0 + zz1) / 2], FRAME, { r: 0, rot: [0, -Math.atan2(zz1 - zz0, x1 - x0), 0] }));
  }
  const both = (f) => [f(1), f(-1)];
  return {
    // the hips: the belt, a plate over the small of the back, and the hips' actuators (lit)
    SC_BASE: [
      ...belt,
      box(0.15, 0.075, 0.024, [0, 0.785, -0.143], PLATE),
      box(0.004, 0.06, 0.004, [0, 0.79, -0.157], GLOW, LIT),
      ...both((s) => cyl(0.034, 0.034, 0.026, 'x', [s * 0.178, 0.69, -0.004], JOINT)),
      ...both((s) => cyl(0.021, 0.021, 0.029, 'x', [s * 0.18, 0.69, -0.004], GLOW, { metal: 0, emi: 1 })),
      ...both((s) => box(0.018, 0.09, 0.06, [s * 0.172, 0.735, -0.004], STRUT)),
    ],
    // the spine's lower vertebrae
    SC_BACKA: [0.83, 0.875].map((vy) => box(0.056, 0.03, 0.03, [0, vy, -0.124], FRAME)),
    // the upper back: more vertebrae, the power unit (its core and lights), the thrusters' nozzles
    // with the glow of them inside, and the yoke over the shoulders with its clips in front
    SC_BACKB: [
      ...[0.925, 0.97].map((vy) => box(0.056, 0.03, 0.03, [0, vy, -0.127], FRAME)),
      box(0.2, 0.17, 0.045, [0, 1.02, -0.152], PLATE, { r: 0.012 }),
      box(0.15, 0.12, 0.01, [0, 1.03, -0.177], FRAME),
      ...both((s) => box(0.007, 0.09, 0.004, [s * 0.048, 1.03, -0.183], GLOW, LIT)),
      cyl(0.026, 0.026, 0.012, 'z', [0, 1.05, -0.183], GLOW, { metal: 0, emi: 1.4, seg: 18 }),
      ...both((s) => cyl(0.026, 0.036, 0.07, 'y', [s * 0.06, 0.91, -0.155], JOINT)),
      ...both((s) => cyl(0.024, 0.024, 0.004, 'y', [s * 0.06, 0.875, -0.155], EMBER, { metal: 0, emi: 0.6 })),
      ...both((s) => box(0.034, 0.024, 0.25, [s * 0.095, 1.114, -0.02], FRAME)),
      ...both((s) => box(0.045, 0.055, 0.016, [s * 0.095, 1.08, 0.097], STRUT)),
    ],
  };
}

// the right side's copy of a part: built again the other way (not mirrored, which would turn its
// faces inside out)
function mirrored(build) {
  return build().map((g) => {
    const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { p.setX(i, -p.getX(i)); n.setX(i, -n.getX(i)); }
    // (each triangle's corners the other way round, so it faces out still)
    for (let i = 0; i < p.count; i += 3) for (const a of Object.values(g.attributes)) {
      for (let k = 0; k < a.itemSize; k++) { const t = a.array[(i + 1) * a.itemSize + k]; a.array[(i + 1) * a.itemSize + k] = a.array[(i + 2) * a.itemSize + k]; a.array[(i + 2) * a.itemSize + k] = t; }
    }
    return g;
  });
}

// The frame, as one geometry per bone (by its name), built once.
let GEOS = null;
export function exoGeometries() {
  if (GEOS) return GEOS;
  GEOS = new Map();
  const merge = (parts) => { const g = mergeGeometries(parts, false); g.computeBoundingSphere(); return g; };
  const left = leftParts();
  for (const k of Object.keys(SIDE_BONE)) {
    GEOS.set(`LF_${k}`, merge(left[k]));
    GEOS.set(`RT_${k}`, merge(mirrored(() => leftParts()[k])));
  }
  for (const [bone, parts] of Object.entries(middleParts())) GEOS.set(bone, merge(parts));
  return GEOS;
}
const ARMS = new Set(['LF_SC_S', 'RT_SC_S', 'LF_SC_E', 'RT_SC_E']);

// For the suit on its own (not worn): a plain dark undersuit in it, the avatar's shape, so it
// reads as a suit and not as bits in the air. The left side's, by bone, then the middle's.
const BODY = 0x16191d, SOFT = { r: 0.02, metal: 0 };
const bodyLeft = () => ({
  SC_S: [box(0.225, 0.11, 0.11, [0.232, 1.033, -0.029], BODY, SOFT)],
  SC_E: [box(0.18, 0.074, 0.078, [0.43, 1.033, -0.027], BODY, SOFT)],
  SC_H: [box(0.155, 0.27, 0.17, [0.088, 0.51, -0.006], BODY, SOFT)],
  SC_K: [box(0.155, 0.24, 0.165, [0.095, 0.25, -0.03], BODY, SOFT)],
  A: [box(0.13, 0.11, 0.29, [0.095, 0.055, 0.03], BODY, SOFT)],
});
const bodyMiddle = () => [
  box(0.3, 0.17, 0.21, [0, 0.715, -0.004], BODY, SOFT),
  box(0.25, 0.33, 0.2, [0, 0.965, -0.012], BODY, SOFT),
];

// The whole suit standing (for its icon, and lying on the ground), height tall, on the ground:
// its arms down at its sides (out in the T-pose, they'd leave the rest of it small), and lighter,
// as an icon shows dark things poorly.
export function exoStanding(height = 0.42) {
  const all = [];
  const add = (bone, g, lighter) => {
    const side = bone.startsWith('LF_') ? 1 : bone.startsWith('RT_') ? -1 : 0;
    // (an arm's parts turned down about the shoulder)
    if (side && (bone.endsWith('SC_S') || bone.endsWith('SC_E'))) {
      g.translate(-side * 0.13, -1.035, 0.03);
      g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-side * 1.4));
      g.translate(side * 0.19, 1.035, -0.03);
    }
    if (lighter) {
      const c = g.attributes.color;
      for (let i = 0; i < c.count; i++) c.setXYZ(i, Math.min(1, c.getX(i) * 2 + 0.06), Math.min(1, c.getY(i) * 2 + 0.06), Math.min(1, c.getZ(i) * 2 + 0.075));
    }
    all.push(g);
  };
  for (const [bone, geo] of exoGeometries()) add(bone, geo.clone(), true);
  for (const k of Object.keys(SIDE_BONE)) {
    add(`LF_${k}`, mergeGeometries(bodyLeft()[k], false), false);
    add(`RT_${k}`, mergeGeometries(mirrored(() => bodyLeft()[k]), false), false);
  }
  for (const g of bodyMiddle()) add('', g, false);
  const g = mergeGeometries(all, false);
  g.computeBoundingBox();
  const bb = g.boundingBox, s = height / (bb.max.y - bb.min.y);
  g.translate(0, -bb.min.y, 0);
  g.scale(s, s, s);
  g.computeBoundingSphere();
  return g;
}

// ---- on an avatar ------------------------------------------------------------------------------

// The flame out of a nozzle: a cone hanging from its mouth, white-hot at the top and orange to
// nothing at its tip, as long and as bright as the thrust (uPower), flickering.
function flameMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uPower: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float uPower; uniform float uTime;
      varying float vT;
      void main() {
        vT = -position.y / 0.3;
        vec3 p = position;
        p.y *= 0.35 + 0.65 * uPower * (0.85 + 0.15 * sin(uTime * 60.0 + position.x * 40.0));
        p.xz *= 0.7 + 0.3 * uPower;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uPower;
      varying float vT;
      void main() {
        vec3 c = mix(vec3(1.0, 0.95, 0.8), vec3(1.0, 0.45, 0.1), smoothstep(0.0, 0.7, vT));
        float a = uPower * (1.0 - smoothstep(0.35, 1.0, vT));
        gl_FragColor = vec4(c * a * 1.6, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
let FLAME_GEO = null;
const flameGeometry = () => FLAME_GEO || (FLAME_GEO = new THREE.ConeGeometry(0.03, 0.3, 12, 1, true).rotateX(Math.PI).translate(0, -0.15, 0));

export class ExoFrame {
  // model: an AvatarModel. armsOnly: just the arms' parts (what you see of yourself in first
  // person). opts: for the material (as makePropMaterial's).
  constructor(model, skyUniforms, terrainUniforms, { armsOnly = false, opts = {} } = {}) {
    this.model = model;
    this.mat = makePropMaterial(skyUniforms, terrainUniforms, { side: THREE.DoubleSide, ...opts });
    this.holders = [];
    for (const [bone, geo] of exoGeometries()) {
      if (armsOnly && !ARMS.has(bone)) continue;
      const holder = model.attach(`${bone}__Skeleton`, [0, 0, 0]);
      const mesh = new THREE.Mesh(geo, this.mat);
      // (the bones move it about: its bounds as it was built aren't where it is)
      mesh.frustumCulled = false;
      holder.add(mesh);
      this.holders.push(holder);
    }
    this.flames = [];
    this.power = 0;
    this.time = 0;
    if (!armsOnly) {
      this.flameMat = flameMaterial();
      for (const n of NOZZLES) {
        const f = model.attach('SC_BACKB__Skeleton', [n.x, n.y, n.z], new THREE.Mesh(flameGeometry(), this.flameMat));
        f.frustumCulled = false;
        f.renderOrder = 19;
        f.visible = false;
        this.flames.push(f);
      }
    }
  }

  setLight(v2) { this.mat.uniforms.uObjLight.value.copy(v2); }

  // the thrusters firing, this hard (0 to 1), from now
  thrust(k) { this.power = Math.max(this.power, k); }

  update(dt) {
    this.time += dt;
    this.power = Math.max(0, this.power - dt * 3.5);
    if (!this.flameMat) return;
    this.flameMat.uniforms.uPower.value = this.power;
    this.flameMat.uniforms.uTime.value = this.time;
    for (const f of this.flames) f.visible = this.power > 0.02;
  }

  // where the nozzles' mouths are in the world (for the smoke and sparks of a boost)
  nozzles() { return this.flames.map((f) => f.getWorldPosition(new THREE.Vector3())); }

  dispose() {
    for (const h of this.holders) h.removeFromParent();
    for (const f of this.flames) f.removeFromParent();
    this.mat.dispose();
    this.flameMat?.dispose();
  }
}
