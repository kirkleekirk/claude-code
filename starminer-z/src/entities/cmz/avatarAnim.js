// CastleMiner Z's avatar animations, ripped from your own copy of the game into
// local-assets/avatar/clips.json (tools/cmz/rip_player.py; never committed), played on the avatar
// rig the original's way. Six layers, in order: the legs (or the whole body), the torso's tilt
// with the view, the pose for what's in hand, using it, the head, dying. A layer's clip sets
// every bone under its mask outright, over whatever the layers before it set; a new clip on a
// layer blends in from what was there.

import * as THREE from 'three';
import { avatarAssets } from '../avatar/assets.js';

const BASE = 'local-assets/avatar/';

// The original's registrations (CastleMinerZGame.SecondaryLoad): name -> [clip, loops, mask,
// unmasked], the masks as AvatarBone indices, each standing for that bone and all below it:
// 1 the lower back, 5 the upper back (arms, neck and head), 12 and 16 the left and right
// shoulders, 14 the neck. No mask is the whole body.
const REG = {
  Stand: ['Stand0', 1], Walk: ['Walk', 1], Run: ['Run', 1], Die: ['Faint', 0], Swim: ['Swim Underwater', 1], Wave: ['Wave', 1],
  Tilt: ['Tilt', 1, [1], [16, 12]], IdleHead: ['MaleIdleLookAround', 1, [14]],
  GenericIdle: ['GenericIdle', 1, [16]], GenericWalk: ['GenericWalk', 1, [16]], GenericUse: ['GenericUse', 1, [5]],
  FistIdle: ['FPSIdle', 1, [5]], FistWalk: ['FPSWalk', 1, [5]], FistUse: ['FPSPick', 1, [5]],
  PickIdle: ['FPSIdle', 1, [16]], PickWalk: ['FPSWalk', 1, [16]], PickUse: ['FPSPick', 1, [16]],
  BlockIdle: ['BlockHoldIdle', 1, [16]], BlockWalk: ['BlockHoldWalk', 1, [16]], BlockUse: ['BlockUse', 1, [16]],
  GunIdle: ['HoldAssultIdle', 1, [5]], GunRun: ['AKRun', 1, [5]], GunShoot: ['AssaultShoot', 1, [5]], GunReload: ['AssaultReload', 0, [5]],
  GunShoulder: ['AssaultShoulder', 0, [5]], GunShoulderIdle: ['AssaultShoulderIdle', 1, [5]], GunShoulderWalk: ['AssaultShoulderWalk', 1, [5]], GunShoulderShoot: ['AssaultShoulderShoot', 1, [5]],
  PistolIdle: ['HoldPistolIdle', 1, [5]], PistolWalk: ['PistolWalk', 1, [5]], PistolShoot: ['PistolShoot', 1, [5]], PistolReload: ['PistolReload', 0, [5]],
  PistolShoulder: ['PistolShoulder', 0, [5]], PistolShoulderIdle: ['PistolShoulderIdle', 1, [5]], PistolShoulderWalk: ['PistolShoulderWalk', 1, [5]], PistolShoulderShoot: ['PistolShoulderShoot', 1, [5]],
  RifleIdle: ['RifleIdle', 1, [5]], RifleWalk: ['RifleWalk', 1, [5]], RifleShoot: ['RifleShoot', 1, [5]], RifleReload: ['RifleReload', 0, [5]],
  RifleShoulder: ['RifleShoulder', 0, [5]], RifleShoulderIdle: ['RifleShoulderIdle', 1, [5]], RifleShoulderWalk: ['RifleShoulderWalk', 1, [5]], RifleShoulderShoot: ['RifleShoulderShoot', 1, [5]],
  SMGIdle: ['SMGIdle', 1, [5]], SMGWalk: ['SMGWalk', 1, [5]], SMGShoot: ['SMGShoot', 1, [5]], SMGReload: ['SMGReload', 0, [5]],
  SMGShoulder: ['SMGShoulder', 0, [5]], SMGShoulderIdle: ['SMGShoulderIdle', 1, [5]], SMGShoulderWalk: ['SMGShoulderWalk', 1, [5]], SMGShoulderShoot: ['SMGShoulderShoot', 1, [5]],
  PumpShotgunShoot: ['PumpShotgunShoot', 1, [5]], PumpShotgunReload: ['PumpShotgunReload', 0, [5]], PumpShotgunShoulderShoot: ['PumpShotgunShoulderShoot', 1, [5]],
};

// What each kind of thing in hand plays (Player.UpdateAnimation, by the item's
// PlayerAnimationMode): standing, walking, using it; a gun's raising to the shoulder, its reload,
// and its standing, walking and firing at the shoulder.
export const MODES = {
  generic: { idle: 'GenericIdle', walk: 'GenericWalk', use: 'GenericUse' },
  tool: { idle: 'PickIdle', walk: 'PickWalk', use: 'PickUse' },
  block: { idle: 'BlockIdle', walk: 'BlockWalk', use: 'BlockUse' },
  fist: { idle: 'FistIdle', walk: 'FistWalk', use: 'FistUse' },
  assault: { idle: 'GunIdle', walk: 'GunRun', use: 'GunShoot', shoulder: 'GunShoulder', reload: 'GunReload', sIdle: 'GunShoulderIdle', sWalk: 'GunShoulderWalk', sUse: 'GunShoulderShoot' },
  shotgun: { idle: 'GunIdle', walk: 'GunRun', use: 'PumpShotgunShoot', shoulder: 'GunShoulder', reload: 'PumpShotgunReload', sIdle: 'GunShoulderIdle', sWalk: 'GunShoulderWalk', sUse: 'PumpShotgunShoulderShoot' },
};
for (const g of ['Pistol', 'Rifle', 'SMG']) {
  MODES[g.toLowerCase()] = { idle: `${g}Idle`, walk: `${g}Walk`, use: `${g}Shoot`, shoulder: `${g}Shoulder`, reload: `${g}Reload`, sIdle: `${g}ShoulderIdle`, sWalk: `${g}ShoulderWalk`, sUse: `${g}ShoulderShoot` };
}

const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

// One clip: a rotation track per bone and the hips' offset from the bind pose.
class Clip {
  constructor(c, rot, pos) {
    this.fps = c.fps;
    this.duration = c.dur;
    this.rot = [];
    this.pos = new Float32Array(3);
    for (const [b, kind, n, off] of c.tracks) {
      if (kind === 1) { this.pos = pos.slice(off * 3, (off + n) * 3); continue; }
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        let x = rot[(off + i) * 4] / 32767, y = rot[(off + i) * 4 + 1] / 32767, z = rot[(off + i) * 4 + 2] / 32767, w = rot[(off + i) * 4 + 3] / 32767;
        const l = Math.hypot(x, y, z, w) || 1;
        a[i * 4] = x / l; a[i * 4 + 1] = y / l; a[i * 4 + 2] = z / l; a[i * 4 + 3] = w / l;
      }
      this.rot[b] = a;
    }
  }

  // the original's CopyTransforms: the key at fps * t, turned toward the next (not into the last
  // one), the last held once the keys run out
  rotation(b, t, q) {
    const a = this.rot[b];
    const n = a.length / 4, f = this.fps * t, i = Math.floor(f);
    if (i >= n) return q.fromArray(a, (n - 1) * 4);
    q.fromArray(a, i * 4);
    if (i < n - 2) q.slerp(_q.fromArray(a, (i + 1) * 4), f - i);
    return q;
  }

  offset(t, v) {
    const a = this.pos;
    const n = a.length / 3, f = this.fps * t, i = Math.floor(f);
    if (i >= n) return v.fromArray(a, (n - 1) * 3);
    v.fromArray(a, i * 3);
    if (i < n - 2) v.lerp(_v.fromArray(a, (i + 1) * 3), f - i);
    return v;
  }
}

// One clip playing (the original's AnimationPlayer).
export class Track {
  constructor(name, clip, mask, looping) {
    this.name = name;
    this.clip = clip;
    this.mask = mask;
    this.looping = looping;
    this.time = 0;
    this.speed = 1;
    this.playing = true;
    this.reversed = false;
    this.pingPong = false;
    this.onPong = false;
  }

  get duration() { return this.clip.duration; }
  get progress() { return this.duration > 0 ? this.time / this.duration : 1; }
  set progress(p) { this.onPong = false; this.time = p * this.duration; }
  get finished() {
    if (this.looping) return false;
    if (this.pingPong && this.onPong) return !(this.progress > 0);
    return !(this.progress < 1);
  }

  advance(dt) {
    const D = this.duration, d = dt * this.speed;
    if (this.playing) this.time += this.onPong ? -d : d;
    if (this.time > D) {
      if (this.pingPong) { this.time = D - (this.time - D); this.onPong = true; } else if (this.looping && D > 0) this.time %= D; else this.time = D;
    } else if (this.time < 0) {
      if (this.pingPong) { if (this.looping) { this.onPong = false; this.time = -this.time; } else this.time = 0; } else if (this.looping && D > 0) this.time = D + (this.time % D); else this.time = 0;
    }
  }

  get at() { return this.reversed ? this.duration - this.time : this.time; }
}

// A layer: the clip on it and the one it's taking over from (the original's AnimBlender).
class Layer {
  constructor() { this.current = null; this.previous = null; this.total = 0; this.elapsed = 0; }

  play(track, blend) {
    this.previous = this.current;
    this.current = track;
    this.total = blend;
    this.elapsed = 0;
  }

  update(dt, pose) {
    const c = this.current, p = this.previous;
    if (!c && !p) return;
    if (c) c.advance(dt);
    if (p && p !== c) p.advance(dt);
    this.elapsed += dt;
    const w = this.total > 0 ? this.elapsed / this.total : 1;
    const n = pose.q.length;
    if (w >= 1) {
      this.previous = null;
      if (!c) return;
      for (let b = 0; b < n; b++) if (c.mask[b]) pose.set(b, c);
      return;
    }
    for (let b = 0; b < n; b++) {
      const inP = p && p.mask[b], inC = c && c.mask[b];
      if (inP && inC) pose.blend(b, p, c, w);
      else if (inP) pose.fade(b, p, 1 - w);
      else if (inC) pose.fade(b, c, w);
    }
  }
}

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _va = new THREE.Vector3(), _vb = new THREE.Vector3();

// The bones of one avatar under the six layers.
export class CmzAnimator {
  // bones: the rig's bones in the original's order; rootBind: the hips' bind position
  constructor(lib, bones, rootBind) {
    this.lib = lib;
    this.bones = bones;
    this.rootBind = rootBind.clone();
    this.q = bones.map((b) => b.quaternion.clone());
    this.p = new THREE.Vector3();
    this.layers = Array.from({ length: 6 }, () => new Layer());
  }

  // The original's AvatarAnimationCollection.Play: a new player for the clip, from its start.
  play(name, layer, blend = 0) {
    const t = this.lib.track(name);
    if (t) this.layers[layer].play(t, blend);
    return t;
  }

  // the same player again (the torso's tilt is set each frame)
  replay(track, layer, blend = 0) { this.layers[layer].play(track, blend); }

  clear(layer, blend = 0) { this.layers[layer].play(null, blend); }

  at(layer) { return this.layers[layer].current; }

  set(b, t) {
    t.clip.rotation(b, t.at, this.q[b]);
    if (b === 0) t.clip.offset(t.at, this.p);
  }

  blend(b, from, to, w) {
    from.clip.rotation(b, from.at, _qa);
    to.clip.rotation(b, to.at, _qb);
    this.q[b].copy(_qa).slerp(_qb, w);
    if (b === 0) this.p.copy(from.clip.offset(from.at, _va)).lerp(to.clip.offset(to.at, _vb), w);
  }

  // part way between what the layers below set and this clip
  fade(b, t, w) {
    this.q[b].slerp(t.clip.rotation(b, t.at, _qa), w);
    if (b === 0) this.p.lerp(t.clip.offset(t.at, _va), w);
  }

  update(dt) {
    for (const L of this.layers) L.update(dt, this);
    const B = this.bones;
    for (let i = 0; i < B.length; i++) if (B[i]) B[i].quaternion.copy(this.q[i]);
    B[0].position.copy(this.rootBind).add(this.p);
  }
}

// ---- loading ------------------------------------------------------------------------------------

let LOADED = null;

// The clips, once; false if they aren't there.
export function loadCmzClips() {
  if (!LOADED) LOADED = load();
  return LOADED;
}

const b64 = (s) => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
};

async function load() {
  try {
    const r = await fetch(BASE + 'clips.json');
    if (!r.ok) return false;
    const d = await r.json();
    const rot = new Int16Array(b64(d.rot)), pos = new Float32Array(b64(d.pos));
    const clips = new Map(Object.entries(d.clips).map(([name, c]) => [name, new Clip(c, rot, pos)]));
    return new ClipLibrary(d.bones, clips);
  } catch {
    return false;
  }
}

class ClipLibrary {
  constructor(boneNames, clips) {
    this.boneNames = boneNames;
    this.clips = clips;
    this.masks = new Map();
    this._parent = null;
  }

  // the rig's hierarchy, in the original's bone order (once the avatar has loaded)
  get parent() {
    if (this._parent) return this._parent;
    const A = avatarAssets();
    const at = new Map(this.boneNames.map((n, i) => [`${n}__Skeleton`, i]));
    this._parent = this.boneNames.map((n) => {
      const ri = A.index.get(`${n}__Skeleton`);
      const pr = ri == null ? -1 : A.rest[ri].parent;
      return pr >= 0 ? at.get(A.bones[pr]) ?? -1 : -1;
    });
    return this._parent;
  }

  // The original's GetInfluncedBoneList: the bones under any of `under`, less those under any of
  // `not`; no `under`, every bone.
  mask(under, not) {
    const key = `${under}|${not}`;
    if (this.masks.has(key)) return this.masks.get(key);
    const n = this.boneNames.length;
    const sub = (roots) => {
      const m = new Uint8Array(n);
      for (const r of roots) m[r] = 1;
      for (let i = 0; i < n; i++) if (!m[i] && this.parent[i] >= 0 && m[this.parent[i]]) m[i] = 1;
      return m;
    };
    const m = under ? sub(under) : new Uint8Array(n).fill(1);
    if (not) { const x = sub(not); for (let i = 0; i < n; i++) if (x[i]) m[i] = 0; }
    this.masks.set(key, m);
    return m;
  }

  has(name) { return !!REG[name] && this.clips.has(REG[name][0]); }

  track(name) {
    const r = REG[name];
    const clip = r && this.clips.get(r[0]);
    if (!clip) return null;
    return new Track(name, clip, this.mask(r[2], r[3]), !!r[1]);
  }

  // The rig's bones in the original's order (null where a rig hasn't one).
  bonesOf(byName) { return this.boneNames.map((n) => byName[`${n}__Skeleton`] || null); }
}
