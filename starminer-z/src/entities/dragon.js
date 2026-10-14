// A dragon's body: the original's own (its DragonBodyHigh and DragonFeetHigh, one skin of five,
// ripped by tools/cmz/rip_models.py into local-assets/models, which is never committed), or a
// stand-in built here when those aren't there. Either way it plays the original's clips by name
// and times them the same, so the dragon flies the same with either.
//
// The original draws its dragons at half size, 11.75 m below and 2 m behind the point it flies
// by (DragonPartEntity), facing down -z, and without fog: they're seen from as far off as the
// sky goes. A clip plays once and the next blends in over its last half second (the original
// starts each again when it's that near its end), so a clip can blend into itself.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CmzBody } from './cmz/bodies.js';
import { makePropMaterial, paint } from '../gfx/propMaterial.js';

// how long each clip runs (the ripped clips' own lengths)
export const CLIP_LEN = { flying_idle: 2.3, fly_forward: 1.3, gethit: 1.6, Idle: 2.633, death_air_1: 2.967 };
// the ripped skins, after the dead's (14 on, in DragonType's order)
const SKIN0 = 14;
// the part's place under the point it flies by
const PART_Y = -11.75, PART_Z = 2;

export function makeDragonModel(app, T) {
  return app.cmzBodies?.models?.dragon ? new RippedDragon(app, T) : new StandInDragon(app, T);
}

// ---- the original's ---------------------------------------------------------------------------

class RippedDragon {
  constructor(app, T) {
    const L = app.cmzBodies, sky = app.sky.uniforms, terrain = app.terrain.uniforms;
    this.part = new THREE.Group();
    this.part.position.set(0, PART_Y, PART_Z);
    this.part.scale.setScalar(0.5);
    this.bodies = ['dragon', 'dragon_feet'].filter((m) => L.models[m]).map((m) => new CmzBody(L, m, SKIN0 + T.skin, sky, terrain, { fog: false }));
    for (const b of this.bodies) {
      this.part.add(b.root);
      // (the clips swing it far outside any bounds kept with the shared geometry)
      b.inner.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
      // each clip twice, so one can blend into the other
      b.twins = new Map();
    }
    this.mouthBone = this.bodies[0].inner.getObjectByName('Bip01_Ponytail1') || null;
    this.cur = null;
    this.paused = false;
  }

  clipFor(b, name) {
    let t = b.twins.get(name);
    if (!t) {
      const c = b.clips.get(name);
      if (!c) return null;
      t = { clips: [c, c.clone()], i: 0 };
      b.twins.set(name, t);
    }
    t.i ^= 1;
    return t.clips[t.i];
  }

  play(name, fade) {
    this.paused = false;
    this.name = name;
    for (const b of this.bodies) {
      const clip = this.clipFor(b, name);
      if (!clip) continue;
      const a = b.mixer.clipAction(clip);
      a.enabled = true;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.reset();
      a.paused = false;
      a.setEffectiveTimeScale(1);
      a.setEffectiveWeight(1);
      a.play();
      if (b.action && b.action !== a) b.action.crossFadeTo(a, fade, false);
      b.action = a;
    }
  }

  // where the clip is, and how long it runs
  time() { return this.bodies[0]?.action?.time ?? 0; }
  duration() { return this.bodies[0]?.action?.getClip().duration ?? CLIP_LEN[this.name] ?? 1; }

  pause() { this.paused = true; for (const b of this.bodies) if (b.action) b.action.paused = true; }
  resume() { this.paused = false; for (const b of this.bodies) if (b.action) b.action.paused = false; }

  update(dt) { for (const b of this.bodies) b.update(dt); }

  // dying, the body comes up to where it flew (its clip takes it down)
  rise(y) { this.part.position.y = y; }

  // where its fire comes from (the original's Bip01_Ponytail1)
  mouth(out) {
    if (!this.mouthBone) return this.part.parent.localToWorld(out.set(0, 1.4, -10.6));
    this.mouthBone.updateWorldMatrix(true, false);
    return this.mouthBone.getWorldPosition(out);
  }

  setLight(sky, block) { for (const b of this.bodies) b.setLight(sky, block); }

  dispose() { for (const b of this.bodies) b.dispose(); this.part.removeFromParent(); }
}

// ---- the stand-in ------------------------------------------------------------------------------

// Built in the flying point's own space (forward -z, up +y), sized to the original's hit boxes:
// a long body, a neck and horned head ahead, a tail behind, wings that flap from the shoulders.
// In each dragon's colours (Fire, Forest, Sand, Ice, Undead).
// Each kind's colours: its back, its belly, its wings' skin, its eyes
const LOOKS = [
  { body: 0xa8341c, belly: 0xe0904a, wing: 0x7a2414, eye: 0xffb020 },
  { body: 0x4a6e2a, belly: 0xa8b860, wing: 0x2e4a1c, eye: 0xd0ff40 },
  { body: 0xb8862e, belly: 0xe8cc88, wing: 0x8a6420, eye: 0xffe060 },
  { body: 0x5aa4c8, belly: 0xdaf0fa, wing: 0x3c7ea4, eye: 0x80f0ff },
  { body: 0x8a8478, belly: 0xc8c0aa, wing: 0x4a4640, eye: 0x60ff60 },
];
const GEOS = new Map();
const _c0 = new THREE.Color(), _c1 = new THREE.Color();

// geometry from a list of triangles' corners, with flat normals, painted one colour (or each
// corner its own: colors, linear rgb)
function tris(points, hex, colors = null, emissive = 0) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(points), 3));
  g.computeVertexNormals();
  paint(g, hex, 0, emissive);
  if (colors) g.attributes.color.array.set(colors);
  return g;
}

// A smooth body through cross-sections ({ z, y, w, h }: an ellipse w across and h high, round
// (0, y, z)), from the first to the last, shaded from the back (top) down to the belly
function loft(sections, segs, back, belly) {
  const ring = (s) => Array.from({ length: segs }, (_, i) => {
    const a = (i / segs) * Math.PI * 2;
    return [Math.cos(a) * s.w, s.y + Math.sin(a) * s.h, s.z, Math.sin(a)];
  });
  const R = sections.map(ring), pos = [], col = [];
  const cb = new THREE.Color(back), cl = new THREE.Color(belly);
  const put = (v) => {
    pos.push(v[0], v[1], v[2]);
    const t = THREE.MathUtils.smoothstep(v[3], -0.45, 0.35);
    _c0.copy(cl).lerp(cb, t);
    col.push(_c0.r, _c0.g, _c0.b);
  };
  for (let k = 0; k < R.length - 1; k++) for (let i = 0; i < segs; i++) {
    const a = R[k][i], b = R[k][(i + 1) % segs], c = R[k + 1][(i + 1) % segs], d = R[k + 1][i];
    put(a); put(d); put(c); put(a); put(c); put(b);
  }
  // closed at both ends
  for (const [k, cz] of [[0, sections[0]], [R.length - 1, sections[sections.length - 1]]]) {
    const mid = [0, cz.y, cz.z, 0];
    for (let i = 0; i < segs; i++) { put(mid); put(R[k][i]); put(R[k][(i + 1) % segs]); }
  }
  return tris(pos, 0xffffff, col);
}

// a tapering bone (or horn, or claw) from a to b, thick at a and thin at b
function bone(a, b, ta, tb, hex) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = new THREE.Vector3().subVectors(B, A);
  const len = d.length(), g = new THREE.CylinderGeometry(tb, ta, len, 5, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()));
  g.translate(A.x, A.y, A.z);
  return paint(g.toNonIndexed(), hex);
}

// skin stretched over a fan of points from the first (y = 0: the wing's plane)
function membrane(points, hex) {
  const pos = [];
  for (let i = 1; i < points.length - 1; i++) pos.push(...points[0], ...points[i], ...points[i + 1]);
  return tris(pos, hex);
}

function geosFor(k) {
  let G = GEOS.get(k);
  if (G) return G;
  const L = LOOKS[k] || LOOKS[0];
  // snout to tail tip (it faces -z)
  const body = loft([
    { z: -11.1, y: 1.45, w: 0.18, h: 0.14 },
    { z: -10.3, y: 1.55, w: 0.55, h: 0.42 },
    { z: -9.1, y: 1.75, w: 0.85, h: 0.66 },
    { z: -8.1, y: 1.95, w: 0.92, h: 0.82 },
    { z: -7.3, y: 1.9, w: 0.62, h: 0.62 },
    { z: -5.6, y: 1.6, w: 0.72, h: 0.76 },
    { z: -3.9, y: 1.2, w: 1.1, h: 1.08 },
    { z: -2.0, y: 0.9, w: 1.6, h: 1.5 },
    { z: 0.5, y: 0.7, w: 1.8, h: 1.6 },
    { z: 3.0, y: 0.6, w: 1.5, h: 1.35 },
    { z: 5.5, y: 0.5, w: 1.0, h: 0.9 },
    { z: 9.0, y: 0.3, w: 0.65, h: 0.55 },
    { z: 13.0, y: 0.0, w: 0.4, h: 0.34 },
    { z: 16.5, y: -0.25, w: 0.2, h: 0.17 },
    { z: 18.6, y: -0.4, w: 0.05, h: 0.05 },
  ], 10, L.body, L.belly);
  const jaw = loft([
    { z: -10.9, y: 1.12, w: 0.16, h: 0.08 },
    { z: -10.0, y: 1.16, w: 0.46, h: 0.18 },
    { z: -8.6, y: 1.32, w: 0.66, h: 0.24 },
    { z: -7.9, y: 1.5, w: 0.5, h: 0.2 },
  ], 8, L.belly, L.belly);
  const parts = [body, jaw];
  // horns, swept back; the eyes
  for (const s of [1, -1]) {
    parts.push(bone([0.45 * s, 2.45, -8.3], [0.9 * s, 3.4, -6.4], 0.22, 0.03, L.belly));
    parts.push(bone([0.25 * s, 2.55, -8.9], [0.45 * s, 3.0, -7.9], 0.12, 0.02, L.belly));
    const e = new THREE.BoxGeometry(0.22, 0.2, 0.32);
    e.translate(0.78 * s, 2.05, -9.1);
    parts.push(paint(e.toNonIndexed(), L.eye, 0, 1));
  }
  // spikes down the spine, smaller along the tail
  for (const [z, y, h] of [[-6.6, 2.55, 0.5], [-4.6, 2.5, 0.6], [-2.6, 2.6, 0.8], [-0.6, 2.45, 0.85], [1.6, 2.15, 0.75], [3.8, 1.85, 0.6], [6.4, 1.3, 0.45], [9.4, 0.85, 0.35], [12.4, 0.4, 0.28], [15.2, 0.0, 0.2]]) {
    parts.push(bone([0, y - 0.15, z], [0, y + h, z + h * 0.8], 0.16 * (h + 0.3), 0.02, L.belly));
  }
  // the tail's spade
  parts.push(membrane([[0, -0.4, 17.4], [0.9, -0.42, 18.4], [0, -0.45, 19.9], [-0.9, -0.42, 18.4]], L.wing));
  // legs, tucked up under it in flight, with claws
  for (const s of [1, -1]) {
    for (const [z, sz] of [[-1.6, 0.8], [3.0, 1]]) {
      const hip = [1.15 * s, 0.1, z], knee = [1.35 * s, -1.0 * sz, z + 0.8 * sz], foot = [1.3 * s, -1.6 * sz, z + 2.0 * sz];
      parts.push(bone(hip, knee, 0.42 * sz, 0.3 * sz, L.body), bone(knee, foot, 0.3 * sz, 0.2 * sz, L.body));
      for (const dx of [-0.18, 0, 0.18]) parts.push(bone(foot, [foot[0] + dx, foot[1] - 0.15, foot[2] + 0.6 * sz], 0.09, 0.01, L.belly));
    }
  }
  // the wings (x outward from the shoulder): the arm out to the wrist, and the skin behind it;
  // past the wrist, three fingers with skin between them, scalloped at the trailing edge
  const inner = mergeGeometries([
    membrane([[0.2, 0, -0.2], [6.5, 0, -0.35], [6.5, 0, 1.2], [4.2, 0, 4.4], [1.0, 0, 5.4], [0, 0, 4.0]], L.wing),
    bone([0, 0, 0], [6.5, 0, -0.3], 0.34, 0.24, L.body),
  ]);
  const F = [[7.6, 0, 0.9], [6.2, 0, 3.7], [3.6, 0, 5.3]];
  const outer = mergeGeometries([
    membrane([[0, 0, 0], F[0], [5.5, 0, 2.2], F[1], [4.0, 0, 3.8], F[2], [1.7, 0, 4.0], [0, 0, 1.5]], L.wing),
    ...F.map((f, i) => bone([0, 0, 0], f, 0.24 - i * 0.04, 0.05, L.body)),
    bone([0, 0, 0], [0.4, 0.15, -0.55], 0.12, 0.02, L.belly),
  ]);
  G = { body: mergeGeometries(parts), inner, outer };
  GEOS.set(k, G);
  return G;
}

class StandInDragon {
  constructor(app, T) {
    this.mat = makePropMaterial(app.sky.uniforms, app.terrain.uniforms, { side: THREE.DoubleSide, noFog: true });
    const G = geosFor(T.id);
    this.part = new THREE.Group();
    this.pose = new THREE.Group();
    this.part.add(this.pose);
    this.pose.add(new THREE.Mesh(G.body, this.mat));
    this.wings = [1, -1].map((side) => {
      const root = new THREE.Group(), tip = new THREE.Group();
      root.position.set(1.5 * side, 1.9, -1.6);
      root.scale.x = side;
      root.add(new THREE.Mesh(G.inner, this.mat));
      tip.position.set(6.5, 0, -0.3);
      tip.add(new THREE.Mesh(G.outer, this.mat));
      root.add(tip);
      this.pose.add(root);
      return { root, tip };
    });
    for (const m of [this.part]) m.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.name = 'flying_idle';
    this.t = 0;
    this.from = null;
    this.fade = 0;
    this.fadeT = 0;
    this.paused = false;
    this.flap = 0;
    this.bend = 0;
    this.tilt = 0;
    this.roll = 0;
  }

  play(name, fade) {
    this.from = { flap: this.flap, bend: this.bend, tilt: this.tilt, roll: this.roll };
    this.fade = fade;
    this.fadeT = 0;
    this.name = name;
    this.t = 0;
    this.paused = false;
  }

  time() { return this.t; }
  duration() { return CLIP_LEN[this.name] ?? 1; }
  pause() { this.paused = true; }
  resume() { this.paused = false; }
  // dying, up onto its belly (the ripped clip's body comes up 11.75 m to where it flew)
  rise(y) { this.pose.position.y = ((y + 11.75) / 11.75) * 1.2; }

  // the pose for a clip at time t: the wings' beat and bend, the body's tilt and roll
  poseAt(name, t) {
    const T = CLIP_LEN[name] ?? 1, w = (t / T) * Math.PI * 2;
    switch (name) {
      case 'fly_forward': return { flap: 0.15 + 0.6 * Math.sin(w), bend: 0.35 * Math.sin(w - 0.7), tilt: 0, roll: 0 };
      case 'Idle': return { flap: 0.35 + 0.75 * Math.sin(w * 2), bend: 0.45 * Math.sin(w * 2 - 0.7), tilt: 0.45, roll: 0 };
      case 'gethit': return { flap: 0.5 * Math.sin(w), bend: 0.4, tilt: -0.25 * Math.sin(w / 2), roll: 0 };
      case 'death_air_1': {
        // thrashing as it's hit, then (the clip held while it falls) down, wings spread on the
        // ground, rolled over a little
        if (t < 1.37) { const k = t / 1.37; return { flap: 0.3 + 0.5 * Math.sin(t * 9) * (1 - k), bend: 0.4, tilt: -0.3 * k, roll: 0.5 * k }; }
        const k = Math.min(1, (t - 1.37) / 0.6), mix = (a, b) => a + (b - a) * k;
        return { flap: mix(0.3, -0.12), bend: mix(0.4, -0.2), tilt: mix(-0.3, -0.08), roll: mix(0.5, 0.3) };
      }
      default: return { flap: 0.12 + 0.04 * Math.sin(w), bend: 0.06, tilt: 0, roll: 0 };
    }
  }

  update(dt) {
    if (!this.paused) this.t = Math.min(this.t + dt, this.duration());
    let p = this.poseAt(this.name, this.t);
    if (this.from && this.fadeT < this.fade) {
      this.fadeT += dt;
      const k = Math.min(1, this.fadeT / this.fade), f = this.from;
      p = { flap: f.flap + (p.flap - f.flap) * k, bend: f.bend + (p.bend - f.bend) * k, tilt: f.tilt + (p.tilt - f.tilt) * k, roll: f.roll + (p.roll - f.roll) * k };
    }
    this.flap = p.flap; this.bend = p.bend; this.tilt = p.tilt; this.roll = p.roll;
    for (const w of this.wings) { w.root.rotation.z = p.flap; w.tip.rotation.z = p.bend; }
    this.pose.rotation.set(p.tilt, 0, p.roll);
  }

  mouth(out) { return this.pose.localToWorld(out.set(0, 1.4, -10.6)); }

  setLight(sky, block) { this.mat.uniforms.uObjLight.value.set(sky, block); }

  dispose() { this.mat.dispose(); this.part.removeFromParent(); }
}
