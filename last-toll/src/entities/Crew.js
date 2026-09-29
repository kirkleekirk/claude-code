import * as THREE from 'three';
import { WalkerModel } from './WalkerModel.js';
import { CREW } from '../data/story.js';
import { RNG } from '../core/rng.js';

// The people aboard the Magnolia. Each stands at their spot, breathes, turns
// their head to follow you when you're near, and turns to face you to talk.
// Each one is also a station the hub can open, so talking works the same way
// as using a bench.

const _v = new THREE.Vector3();

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class Crew {
  constructor(boat) {
    this.boat = boat;
    this.members = [];
    this.talking = null;
    const rng = new RNG(1771);
    for (const [id, c] of Object.entries(CREW)) {
      const model = new WalkerModel(rng, { living: c.look });
      const [x, z] = c.pos;
      model.root.position.set(x, 0, z);
      model.root.rotation.y = c.facing;
      model.mesh.castShadow = true;
      boat.scene.add(model.root);
      boat.world.addBoxC(x, 0.9, z, 0.55, 1.8, 0.55, { occlude: false, kind: 'furniture' });
      const head = new THREE.Vector3(x, model.headHeight, z);
      const hit = { x0: x - 0.38, x1: x + 0.38, y0: 0, y1: 1.95, z0: z - 0.38, z1: z + 0.38 };
      const st = {
        id, npc: true, label: c.name, center: new THREE.Vector3(x, 0, z), face: new THREE.Vector3(Math.sin(c.facing), 0, Math.cos(c.facing)),
        hit, view: { pos: new THREE.Vector3(), look: head.clone() }, anchor: null, verb: 'Talk to', pivot: false,
      };
      boat.stations.push(st);
      this.members.push({ id, c, model, head, st, facing: c.facing, home: c.facing, want: c.facing, yaw: 0, pitch: 0, talk: false, barkT: 0 });
    }
  }

  get(id) {
    return this.members.find((m) => m.id === id);
  }

  // Where the camera settles to talk: in front of them, on the side you came from.
  talkView(id, from) {
    const m = this.get(id);
    const dx = from.x - m.head.x, dz = from.z - m.head.z;
    const a = Math.atan2(dx, dz);
    m.want = a;
    const d = 1.25;
    const pos = new THREE.Vector3(m.head.x + Math.sin(a) * d, 1.6, m.head.z + Math.cos(a) * d);
    // the face sits in the upper part of the frame, above the dialogue box
    const look = new THREE.Vector3(m.head.x, m.head.y - 0.26, m.head.z);
    return { pos, look };
  }

  startTalk(id) {
    this.talking = id;
  }

  endTalk() {
    for (const m of this.members) {
      m.want = m.home;
      m.talk = false;
    }
    this.talking = null;
  }

  setSpeaking(id, v) {
    const m = this.get(id);
    if (m) m.talk = v;
  }

  update(dt, camPos) {
    for (const m of this.members) {
      const talking = this.talking === m.id;
      // turn the body toward whoever they're talking to, and back home after
      const df = wrap(m.want - m.facing);
      m.facing += df * Math.min(1, dt * (talking ? 3.5 : 1.2));
      m.model.root.rotation.y = m.facing;
      // eyes on the camera when it's close and in front of them
      _v.copy(camPos).sub(m.head);
      const dist = Math.hypot(_v.x, _v.z);
      const rel = wrap(Math.atan2(_v.x, _v.z) - m.facing);
      const watch = talking || (dist < 5 && Math.abs(rel) < 1.9);
      const ty = watch ? Math.max(-1.1, Math.min(1.1, rel)) : Math.sin(this.boat.t * 0.13 + m.head.x) * 0.25;
      const tp = watch ? Math.atan2(_v.y, Math.max(0.3, dist)) : 0;
      m.yaw += (ty - m.yaw) * Math.min(1, dt * 4);
      m.pitch += (tp - m.pitch) * Math.min(1, dt * 4);
      m.model.animate(dt, { speed: 0, pose: talking && m.c.pose === 'smoke' ? 'stand' : m.c.pose, lookYaw: m.yaw, lookPitch: m.pitch, talk: m.talk });
      m.near = dist < 3.2 && Math.abs(rel) < 1.6;
      m.distFar = dist > 6;
    }
  }
}
