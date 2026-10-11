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
const LOOKS = [
  { body: 0x7a2a18, belly: 0xc0703a, wing: 0x5a1a10, eye: 0xffb020 },
  { body: 0x3d5a22, belly: 0x8a9a4a, wing: 0x2a4018, eye: 0xd0ff40 },
  { body: 0x9a7020, belly: 0xd8b870, wing: 0x7a5418, eye: 0xffe060 },
  { body: 0x4a8fb0, belly: 0xc8e4f0, wing: 0x346a8a, eye: 0x80f0ff },
  { body: 0x5a5448, belly: 0x9a9280, wing: 0x3a3630, eye: 0x60ff60 },
];
const GEOS = new Map();

function box(w, h, d, x, y, z, rx = 0, color = 0xffffff, emi = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return paint(g.toNonIndexed(), color, 0, emi);
}

function cone(r, h, x, y, z, rx, color) {
  const g = new THREE.ConeGeometry(r, h, 6);
  g.rotateX(rx);
  g.translate(x, y, z);
  return paint(g.toNonIndexed(), color);
}

// one wing's half: a bone along its front edge and the skin behind it (x outward)
function wingHalf(len, chord, sweep, look) {
  const skin = new THREE.BufferGeometry();
  const p = [0, 0, -0.6, len, 0, -0.6 + sweep, len, 0, chord * 0.35 + sweep, 0, 0, chord];
  skin.setAttribute('position', new THREE.BufferAttribute(new Float32Array([p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7], p[8], p[0], p[1], p[2], p[6], p[7], p[8], p[9], p[10], p[11]]), 3));
  skin.computeVertexNormals();
  return mergeGeometries([paint(skin, look.wing), box(len, 0.35, 0.45, len / 2, 0, -0.6 + sweep / 2, 0, look.body)]);
}

function geosFor(k) {
  let G = GEOS.get(k);
  if (G) return G;
  const L = LOOKS[k] || LOOKS[0];
  const parts = [
    box(3.2, 2.8, 8.6, 0, 0.7, 0.3, 0, L.body),
    box(2.6, 0.6, 7.4, 0, -0.8, 0.3, 0, L.belly),
    box(1.7, 1.7, 3.6, 0, 1.4, -5.3, -0.3, L.body),
    box(2.0, 1.6, 3.0, 0, 1.9, -7.6, 0, L.body),
    box(1.4, 0.9, 2.2, 0, 1.6, -9.6, 0, L.body),
    box(1.3, 0.4, 2.6, 0, 0.95, -9.0, 0.12, L.belly),
    box(0.3, 0.3, 0.3, 0.75, 2.35, -8.6, 0, L.eye, 1),
    box(0.3, 0.3, 0.3, -0.75, 2.35, -8.6, 0, L.eye, 1),
    cone(0.28, 1.6, 0.6, 3.0, -6.6, -0.9, L.belly),
    cone(0.28, 1.6, -0.6, 3.0, -6.6, -0.9, L.belly),
    // the tail, thinner and thinner
    box(2.0, 1.8, 3.6, 0, 0.6, 6.3, 0.05, L.body),
    box(1.4, 1.2, 3.6, 0, 0.35, 9.7, 0.08, L.body),
    box(0.9, 0.8, 3.6, 0, 0.05, 13.0, 0.1, L.body),
    box(0.5, 0.5, 3.2, 0, -0.3, 16.1, 0.12, L.body),
    box(1.6, 0.2, 1.4, 0, -0.45, 18.1, 0, L.wing),
    // legs, tucked up
    box(0.8, 1.6, 1.2, 1.3, -1.2, -2.6, 0.6, L.body),
    box(0.8, 1.6, 1.2, -1.3, -1.2, -2.6, 0.6, L.body),
    box(0.9, 1.8, 1.4, 1.3, -1.2, 3.0, 0.9, L.body),
    box(0.9, 1.8, 1.4, -1.3, -1.2, 3.0, 0.9, L.body),
  ];
  G = { body: mergeGeometries(parts), inner: wingHalf(7, 6, 0.6, L), outer: wingHalf(7.5, 4.5, 2.2, L) };
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
      tip.position.set(7, 0, 0);
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
