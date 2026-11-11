import * as THREE from 'three';
import { Geo, M, tubeGeo, bladeGeo, temp } from '../gfx/geo.js';
import { litMaterial } from '../gfx/materials.js';
import { addLight } from '../gfx/globals.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const col = (c, glow = 0, sway = 0) => (p, n, o) => { o[0] = c[0]; o[1] = c[1]; o[2] = c[2]; o[3] = glow; o[4] = sway; };
const mesh = (g, mat) => { const m = new THREE.Mesh(g.build(), mat); m.frustumCulled = false; return m; };

export const CREATURES = {
  skitter: { name: 'Skitter', hp: 34, speed: 6.4, dmg: 9, range: 1.5, aggro: 24, kind: 'melee', radius: 0.55, height: 0.7, cool: 0.9, drops: [['chitin', 1, 2, 0.9]] },
  mite: { name: 'Vault Mite', hp: 28, speed: 7.2, dmg: 8, range: 1.4, aggro: 30, kind: 'melee', radius: 0.5, height: 0.6, cool: 0.8, drops: [['chitin', 1, 1, 0.5]] },
  stalker: { name: 'Thresher', hp: 150, speed: 7.2, dmg: 24, range: 2.5, aggro: 32, kind: 'charger', radius: 0.95, height: 1.5, cool: 1.3, drops: [['chitin', 2, 3, 1], ['bloom', 1, 1, 0.35]] },
  drifter: { name: 'Drifter', hp: 55, speed: 3.4, dmg: 13, range: 22, aggro: 30, kind: 'ranged', fly: 3.0, radius: 0.75, height: 1.2, cool: 2.0, bolt: [0.9, 0.5, 1.0], drops: [['gland', 1, 1, 0.85]] },
  borer: { name: 'Borer', hp: 90, speed: 6.8, dmg: 16, range: 1.7, aggro: 26, kind: 'melee', radius: 0.7, height: 1.1, cool: 1.0, drops: [['korrite', 1, 2, 0.6], ['voltite', 1, 1, 0.35]] },
  sentinel: { name: 'Sentinel', hp: 95, speed: 4.0, dmg: 15, range: 24, aggro: 34, kind: 'ranged', fly: 1.9, radius: 0.85, height: 1.4, cool: 1.7, bolt: [1.0, 0.85, 0.4], drops: [['core', 1, 1, 0.5]] },
  custodian: { name: 'Custodian', hp: 280, speed: 3.7, dmg: 32, range: 3.3, aggro: 30, kind: 'slam', radius: 1.2, height: 2.9, cool: 1.6, drops: [['core', 1, 1, 1]] },
  warden: { name: 'The Warden', hp: 2400, speed: 5, dmg: 24, range: 70, aggro: 90, kind: 'boss', fly: 7.5, radius: 3.2, height: 5, cool: 1, bolt: [1.0, 0.75, 0.3], drops: [] },
};

function buildSkitter(mite) {
  const mat = litMaterial({ wrap: 0.3, glow: 1.8, rim: 0.5, rimCol: mite ? 0xff9a40 : 0x60ffe0, spec: 0.5, shin: 40, nightBoost: 0.4 });
  const shell = mite ? [0.2, 0.08, 0.05] : [0.06, 0.06, 0.15], gl = mite ? [1, 0.5, 0.1] : [0.2, 1, 0.8];
  const group = new THREE.Group();
  const g = new Geo();
  g.add(temp(new THREE.SphereGeometry(0.4, 12, 8)), M.trs(0, 0.4, 0, 0, 0, 0, 0.85, 0.5, 1.15), (p, n, o) => {
    const spot = p.y > 0.08 && Math.sin(p.x * 11) * Math.sin(p.z * 8) > 0.45;
    o[0] = spot ? gl[0] : shell[0]; o[1] = spot ? gl[1] : shell[1]; o[2] = spot ? gl[2] : shell[2]; o[3] = spot ? 0.9 : 0;
    if (p.y < -0.1) { o[0] *= 2.2; o[1] *= 1.8; o[2] *= 1.6; }
  });
  g.add(temp(new THREE.SphereGeometry(0.2, 10, 7)), M.trs(0, 0.36, 0.5, 0, 0, 0, 1, 0.8, 1), col(shell));
  for (const sx of [-1, 1]) {
    g.add(temp(new THREE.SphereGeometry(0.05, 6, 5)), M.trs(sx * 0.1, 0.43, 0.66), col(gl, 1));
    g.add(temp(new THREE.ConeGeometry(0.035, 0.22, 5)), M.trs(sx * 0.08, 0.3, 0.74, Math.PI / 2, sx * 0.35, 0), col([0.5, 0.45, 0.4]));
  }
  g.add(temp(new THREE.ConeGeometry(0.1, 0.4, 5)), M.trs(0, 0.42, -0.6, -Math.PI / 2 + 0.4, 0, 0), col(shell));
  const body = mesh(g, mat);
  group.add(body);
  const legs = [];
  const lg = new Geo();
  lg.add(tubeGeo([V(0, 0, 0), V(0.3, 0.2, 0), V(0.6, -0.38, 0)], [0.05, 0.035, 0.012], 5, true), null, col([shell[0] * 1.6, shell[1] * 1.6, shell[2] * 1.4]));
  const legGeo = lg.build();
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1, k = i % 3;
    const m = new THREE.Mesh(legGeo, mat);
    m.frustumCulled = false;
    m.position.set(side * 0.28, 0.38, 0.3 - k * 0.3);
    m.userData = { base: (side > 0 ? 0 : Math.PI) + side * (k - 1) * -0.45, off: (k % 2 === 0) === (side > 0) ? 0 : Math.PI, side };
    group.add(m); legs.push(m);
  }
  return {
    group, mat, phase: 0,
    anim(c, dt) {
      this.phase += (c.moveSpeed * 2.6 + 0.6) * dt;
      for (const l of legs) {
        const u = l.userData;
        l.rotation.y = u.base + Math.sin(this.phase + u.off) * 0.45 * u.side;
        l.rotation.z = Math.max(0, Math.cos(this.phase + u.off)) * 0.4 * u.side;
      }
      body.position.y = Math.sin(this.phase * 2) * 0.02 + (c.state === 'windup' ? 0.12 : 0);
      body.rotation.x = c.state === 'windup' ? -0.35 : c.state === 'strike' ? 0.3 : 0;
    },
  };
}

function buildStalker() {
  const mat = litMaterial({ wrap: 0.3, glow: 2.0, rim: 0.55, rimCol: 0xff5fb0, spec: 0.6, shin: 40, nightBoost: 0.3 });
  const hide = [0.11, 0.03, 0.05], gl = [1, 0.25, 0.7];
  const group = new THREE.Group();
  const g = new Geo();
  g.add(temp(new THREE.CapsuleGeometry(0.38, 1.1, 4, 10)), M.trs(0, 1.0, 0, Math.PI / 2, 0, 0, 1, 1, 0.92), (p, n, o) => {
    const belly = n.z > 0.3;
    o[0] = belly ? 0.26 : hide[0]; o[1] = belly ? 0.1 : hide[1]; o[2] = belly ? 0.13 : hide[2];
    const stripe = Math.abs(Math.sin(p.y * 7)) > 0.92 && n.z < 0;
    if (stripe) { o[0] = gl[0]; o[1] = gl[1]; o[2] = gl[2]; o[3] = 0.8; }
  });
  for (let i = 0; i < 7; i++) {
    const z = 0.65 - i * 0.22, h = 0.28 + Math.sin((i / 6) * Math.PI) * 0.3;
    g.add(bladeGeo(V(0, 1.3, z), V(0, 1.3 + h * 0.6, z - 0.05), V(0, 1.3 + h, z - 0.18), 0.2, 2), null, col(gl, 0.9));
  }
  g.add(tubeGeo([V(0, 1.0, -0.8), V(0, 1.25, -1.4), V(0, 1.05, -2.0), V(0, 0.8, -2.35)], [0.16, 0.1, 0.06, 0.02], 6, true), null, (p, n, o) => {
    const t = Math.min(1, Math.max(0, (-p.z - 0.8) / 1.5));
    o[0] = hide[0] + t * 0.9; o[1] = hide[1] + t * 0.2; o[2] = hide[2] + t * 0.6; o[3] = t * t;
  });
  const body = mesh(g, mat);
  group.add(body);
  const hg = new Geo();
  hg.add(temp(new THREE.ConeGeometry(0.34, 0.9, 6)), M.trs(0, 0, 0.35, Math.PI / 2, 0, 0, 1, 1, 0.75), col(hide));
  hg.add(temp(new THREE.BoxGeometry(0.34, 0.1, 0.6)), M.trs(0, -0.2, 0.3, 0.2, 0, 0), col([0.28, 0.1, 0.12]));
  for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) hg.add(temp(new THREE.SphereGeometry(0.045, 6, 5)), M.trs(sx * (0.16 - k * 0.05), 0.12 + k * 0.03, 0.3 + k * 0.2), col([1, 0.9, 0.3], 1));
  for (const sx of [-1, 1]) hg.add(temp(new THREE.ConeGeometry(0.035, 0.2, 4)), M.trs(sx * 0.1, -0.12, 0.62, Math.PI, 0, 0), col([0.8, 0.75, 0.7]));
  const head = mesh(hg, mat);
  head.position.set(0, 1.08, 0.75);
  group.add(head);
  const lg = new Geo();
  lg.add(tubeGeo([V(0, 0, 0), V(0.1, -0.48, 0.12), V(0.08, -1.0, -0.04)], [0.14, 0.09, 0.05], 6, true), null, col([0.15, 0.05, 0.07]));
  const legGeo = lg.build();
  const legs = [];
  for (let i = 0; i < 4; i++) {
    const sx = i % 2 ? 1 : -1, front = i < 2;
    const m = new THREE.Mesh(legGeo, mat);
    m.frustumCulled = false;
    m.position.set(sx * 0.3, 1.0, front ? 0.5 : -0.5);
    m.scale.x = sx;
    m.userData.off = (front ? 0 : Math.PI) + (sx > 0 ? 0.5 : 0);
    group.add(m); legs.push(m);
  }
  return {
    group, mat, phase: 0,
    anim(c, dt) {
      this.phase += (c.moveSpeed * 1.5 + 0.4) * dt;
      const a = Math.min(1, c.moveSpeed / 5) * 0.75 + 0.05;
      for (const l of legs) l.rotation.x = Math.sin(this.phase + l.userData.off) * a;
      body.position.y = Math.abs(Math.sin(this.phase)) * 0.06 * a;
      head.rotation.x = c.state === 'windup' ? -0.5 : Math.sin(this.phase * 0.5) * 0.06;
      head.position.y = 1.08 + body.position.y;
      body.rotation.x = c.state === 'charge' ? 0.12 : 0;
    },
  };
}

function buildDrifter() {
  const mat = litMaterial({ sway: 0.3, double: true, wrap: 0.7, trans: 0.8, glow: 1.6, rim: 0.8, rimCol: 0xc090ff, nightBoost: 0.5 });
  const group = new THREE.Group();
  const g = new Geo();
  g.add(temp(new THREE.SphereGeometry(0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)), M.trs(0, 0, 0, 0, 0, 0, 1, 0.82, 1), (p, n, o) => {
    const t = Math.max(0, p.y / 0.5);
    const vein = Math.abs(Math.sin(Math.atan2(p.z, p.x) * 6)) > 0.93;
    o[0] = 0.35 + 0.3 * t; o[1] = 0.22 + 0.5 * (1 - t); o[2] = 0.75;
    o[3] = vein ? 0.9 : 0.28 + 0.2 * (1 - t);
    if (vein) { o[0] = 1; o[1] = 0.6; o[2] = 1; }
  });
  g.add(temp(new THREE.SphereGeometry(0.22, 10, 8)), M.trs(0, 0.12, 0), col([1, 0.55, 0.9], 1));
  g.add(temp(new THREE.TorusGeometry(0.6, 0.04, 5, 22).rotateX(Math.PI / 2)), M.trs(0, -0.06, 0), col([0.6, 1, 0.95], 0.9));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * 6.283, R = 0.3 + (i % 2) * 0.2, L = 1.1 + (i % 3) * 0.4;
    const x = Math.cos(a) * R, z = Math.sin(a) * R;
    g.add(tubeGeo([V(x, -0.05, z), V(x * 1.1, -L * 0.4, z * 1.1), V(x * 0.9, -L * 0.75, z * 0.9), V(x * 1.05, -L, z * 1.05)], [0.04, 0.03, 0.02, 0.006], 5, true), null, (p, n, o) => {
      const t = Math.min(1, -p.y / L);
      o[0] = 0.55; o[1] = 0.4 + 0.5 * t; o[2] = 0.95; o[3] = 0.25 + 0.6 * t; o[4] = t * 1.2;
    });
  }
  const body = mesh(g, mat);
  group.add(body);
  return {
    group, mat,
    anim(c, dt) {
      const pulse = Math.sin(c.t * 2.4);
      body.scale.set(1 + pulse * 0.06, 1 - pulse * 0.08, 1 + pulse * 0.06);
      body.rotation.z = Math.sin(c.t * 0.7) * 0.08;
      if (c.state === 'windup') body.scale.multiplyScalar(1.15);
    },
  };
}

function buildBorer() {
  const mat = litMaterial({ wrap: 0.2, glow: 2.2, rim: 0.4, rimCol: 0xff8040, spec: 0.5, shin: 30 });
  const group = new THREE.Group();
  const g = new Geo();
  let f = 0;
  g.add(temp(new THREE.IcosahedronGeometry(0.62, 1)), null, (p, n, o, i) => {
    f = Math.floor(i / 3);
    const crack = (f * 7919) % 5 === 0;
    const v = 0.7 + ((f * 131) % 7) * 0.06;
    o[0] = crack ? 1 : 0.13 * v; o[1] = crack ? 0.4 : 0.12 * v; o[2] = crack ? 0.08 : 0.13 * v; o[3] = crack ? 1 : 0;
  }, true);
  const shell = mesh(g, mat);
  shell.position.y = 0.66;
  group.add(shell);
  const e = new Geo();
  e.add(temp(new THREE.SphereGeometry(0.14, 8, 6)), M.trs(0, 0.7, 0.58), col([1, 0.7, 0.2], 1));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) e.add(temp(new THREE.ConeGeometry(0.12, 0.5, 5)), M.trs(sx * 0.42, 0.22, sz * 0.36, 0, 0, sx * 0.5), col([0.2, 0.18, 0.18]));
  const base = mesh(e, mat);
  group.add(base);
  return {
    group, mat,
    anim(c, dt) {
      shell.rotation.x += c.moveSpeed * dt * 1.6;
      base.position.y = Math.abs(Math.sin(c.t * 9)) * 0.03 * Math.min(1, c.moveSpeed);
      shell.position.y = 0.66 + (c.state === 'windup' ? 0.25 : 0);
    },
  };
}

function buildSentinel(color = [1.0, 0.85, 0.45]) {
  const mat = litMaterial({ wrap: 0.2, glow: 2.2, rim: 0.5, rimCol: 0xffe0a0, spec: 0.6, shin: 50, metal: 0.3 });
  const stone = [0.13, 0.13, 0.17];
  const group = new THREE.Group();
  const g = new Geo();
  g.add(temp(new THREE.OctahedronGeometry(0.36)), M.trs(0, 0, 0, 0, 0, 0, 1, 1.35, 1), col(color, 1), true);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 6.283 + 0.78;
    g.add(temp(new THREE.BoxGeometry(0.12, 0.9, 0.5)), M.trs(Math.cos(a) * 0.5, 0, Math.sin(a) * 0.5, 0, -a, 0.12), col(stone), true);
  }
  g.add(temp(new THREE.CylinderGeometry(0.12, 0.12, 0.05, 12)), M.trs(0, 0, 0.56, Math.PI / 2, 0, 0), col([0.5, 1, 1], 1));
  const core = mesh(g, mat);
  group.add(core);
  const ringGeo = (R, t) => {
    const r = new Geo();
    r.add(temp(new THREE.TorusGeometry(R, t, 6, 30)), null, (p, n, o) => {
      const seg = Math.sin(Math.atan2(p.y, p.x) * 8) > 0.7;
      o[0] = seg ? color[0] : stone[0]; o[1] = seg ? color[1] : stone[1]; o[2] = seg ? color[2] : stone[2]; o[3] = seg ? 0.9 : 0;
    });
    return mesh(r, mat);
  };
  const r1 = ringGeo(0.82, 0.07), r2 = ringGeo(1.03, 0.05);
  r2.rotation.x = Math.PI / 2;
  group.add(r1); group.add(r2);
  return {
    group, mat,
    anim(c, dt) {
      const sp = c.state === 'windup' ? 9 : 1.6;
      r1.rotation.y += dt * sp; r1.rotation.x += dt * 0.4;
      r2.rotation.z += dt * sp * 0.8; r2.rotation.y += dt * 0.3;
      core.rotation.y = 0;
      const s = 1 + Math.sin(c.t * 4) * 0.05 + (c.state === 'windup' ? 0.2 : 0);
      core.scale.setScalar(s);
    },
  };
}

function buildCustodian() {
  const mat = litMaterial({ wrap: 0.15, glow: 2.0, rim: 0.3, rimCol: 0xffc070, spec: 0.2, shin: 20 });
  const stone = [0.15, 0.15, 0.19], gl = [1.0, 0.7, 0.25];
  const sfn = (bands) => (p, n, o) => {
    const v = 0.75 + 0.3 * Math.sin(p.x * 5 + p.y * 7) * Math.cos(p.z * 6);
    o[0] = stone[0] * v; o[1] = stone[1] * v; o[2] = stone[2] * v;
    if (bands && Math.abs(((p.y * bands) % 1 + 1) % 1 - 0.5) < 0.07) { o[0] = gl[0]; o[1] = gl[1]; o[2] = gl[2]; o[3] = 1; }
  };
  const group = new THREE.Group();
  const g = new Geo();
  g.add(temp(new THREE.BoxGeometry(1.35, 1.4, 0.95, 1, 2, 1)), M.trs(0, 2.0, 0), sfn(1.5), true);
  g.add(temp(new THREE.BoxGeometry(0.95, 0.5, 0.75)), M.trs(0, 1.1, 0), sfn(0), true);
  g.add(temp(new THREE.BoxGeometry(0.72, 0.46, 0.62)), M.trs(0, 2.95, 0.05), sfn(0), true);
  g.add(temp(new THREE.BoxGeometry(0.5, 0.09, 0.05)), M.trs(0, 2.98, 0.37), col(gl, 1), true);
  g.add(temp(new THREE.OctahedronGeometry(0.2)), M.trs(0, 2.0, 0.5), col(gl, 1), true);
  const body = mesh(g, mat);
  group.add(body);
  const limb = (w, h, d, bands) => { const a = new Geo(); a.add(temp(new THREE.BoxGeometry(w, h, d, 1, 2, 1)), M.trs(0, -h / 2, 0), sfn(bands), true); return a; };
  const legs = [], arms = [];
  for (const sx of [-1, 1]) {
    const l = mesh(limb(0.42, 1.0, 0.5, 0), mat); l.position.set(sx * 0.3, 1.0, 0); group.add(l); legs.push(l);
    const ag = limb(0.44, 1.1, 0.44, 2);
    ag.add(temp(new THREE.BoxGeometry(0.62, 0.72, 0.62)), M.trs(0, -1.4, 0), sfn(0), true);
    const a = mesh(ag, mat); a.position.set(sx * 0.95, 2.5, 0); group.add(a); arms.push(a);
  }
  return {
    group, mat, phase: 0,
    anim(c, dt) {
      this.phase += c.moveSpeed * 1.3 * dt;
      const a = Math.min(1, c.moveSpeed / 3) * 0.5;
      legs[0].rotation.x = Math.sin(this.phase) * a; legs[1].rotation.x = -Math.sin(this.phase) * a;
      let ar = -Math.sin(this.phase) * a * 0.6, al = Math.sin(this.phase) * a * 0.6;
      if (c.state === 'windup') { const k = Math.min(1, c.stateT / 0.6); ar = al = -2.7 * k; }
      else if (c.state === 'strike') { ar = al = 0.5; }
      arms[0].rotation.x = al; arms[1].rotation.x = ar;
      body.position.y = Math.abs(Math.sin(this.phase)) * 0.05;
    },
  };
}

function buildWarden() {
  const mat = litMaterial({ wrap: 0.2, glow: 2.4, rim: 0.6, rimCol: 0xfff0b0, spec: 0.7, shin: 60, metal: 0.4 });
  const stone = [0.11, 0.11, 0.15], gl = [1.0, 0.82, 0.4];
  const group = new THREE.Group();
  const g = new Geo();
  g.add(temp(new THREE.IcosahedronGeometry(1.4, 1)), null, (p, n, o, i) => {
    const f = Math.floor(i / 3);
    const lit = (f * 31) % 3 === 0;
    o[0] = lit ? gl[0] : stone[0]; o[1] = lit ? gl[1] : stone[1]; o[2] = lit ? gl[2] : stone[2]; o[3] = lit ? 1 : 0;
  }, true);
  g.add(temp(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 20)), M.trs(0, 0, 1.38, Math.PI / 2, 0, 0), col([0.4, 1, 1], 1));
  const core = mesh(g, mat);
  group.add(core);
  const rings = [];
  [3.0, 3.8, 4.6].forEach((R, k) => {
    const r = new Geo();
    r.add(temp(new THREE.TorusGeometry(R, 0.22, 6, 44)), null, (p, n, o) => {
      const seg = Math.sin(Math.atan2(p.y, p.x) * (10 + k * 2)) > 0.72;
      o[0] = seg ? gl[0] : stone[0]; o[1] = seg ? gl[1] : stone[1]; o[2] = seg ? gl[2] : stone[2]; o[3] = seg ? 1 : 0;
    });
    const m = mesh(r, mat);
    m.rotation.set(k * 1.1, k * 0.7, 0);
    group.add(m); rings.push(m);
  });
  const shards = [];
  for (let i = 0; i < 4; i++) {
    const s = new Geo();
    s.add(temp(new THREE.CylinderGeometry(0.1, 0.55, 3.2, 4, 3)), null, (p, n, o) => {
      const band = Math.abs(((p.y * 0.9) % 1 + 1) % 1 - 0.5) < 0.06;
      o[0] = band ? gl[0] : stone[0]; o[1] = band ? gl[1] : stone[1]; o[2] = band ? gl[2] : stone[2]; o[3] = band ? 1 : 0;
    }, true);
    const m = mesh(s, mat);
    group.add(m); shards.push(m);
  }
  return {
    group, mat, rings, shards,
    anim(c, dt) {
      const fast = c.state === 'windup' || c.enraged ? 2.4 : 1;
      rings[0].rotation.x += dt * 0.7 * fast; rings[0].rotation.y += dt * 0.3 * fast;
      rings[1].rotation.y += dt * 0.9 * fast; rings[1].rotation.z += dt * 0.2 * fast;
      rings[2].rotation.z += dt * 0.5 * fast; rings[2].rotation.x -= dt * 0.25 * fast;
      for (let i = 0; i < 4; i++) {
        const a = c.t * 0.8 * fast + (i / 4) * 6.283, R = 6.2 + Math.sin(c.t * 0.5 + i) * 0.6;
        shards[i].position.set(Math.cos(a) * R, Math.sin(c.t * 1.3 + i * 2) * 1.2, Math.sin(a) * R);
        shards[i].rotation.y = -a;
      }
      core.scale.setScalar(1 + Math.sin(c.t * 3) * 0.04 + (c.state === 'windup' ? 0.15 : 0));
    },
  };
}

const BUILDERS = {
  skitter: () => buildSkitter(false), mite: () => buildSkitter(true), stalker: buildStalker, drifter: buildDrifter,
  borer: buildBorer, sentinel: () => buildSentinel(), custodian: buildCustodian, warden: buildWarden,
};

const TAU = Math.PI * 2;
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }

export class Creature {
  constructor(game, type, x, y, z, opts = {}) {
    this.game = game; this.type = type;
    const T = (this.T = CREATURES[type]);
    this.model = BUILDERS[type]();
    this.group = this.model.group;
    const sc = opts.scale || 1;
    this.group.scale.setScalar(sc);
    this.pos = new THREE.Vector3(x, y, z);
    this.home = new THREE.Vector3(x, y, z);
    this.yaw = Math.random() * TAU;
    this.maxHp = T.hp * (opts.hpMul || 1); this.hp = this.maxHp;
    this.dmgMul = opts.dmgMul || 1;
    this.radius = T.radius * sc; this.height = T.height * sc;
    this.state = 'idle'; this.stateT = 0; this.t = Math.random() * 10;
    this.cool = 1 + Math.random(); this.flash = 0; this.dead = false; this.remove = false;
    this.moveSpeed = 0; this.alert = false; this.wanderT = 0; this.wx = x; this.wz = z;
    this.hurtT = 0; this.tag = opts.tag; this.chargeDir = new THREE.Vector3();
    this.alt = T.fly || 0; this.strafe = Math.random() < 0.5 ? 1 : -1; this.bossT = 0; this.volley = 0; this.enraged = false;
    this.group.position.copy(this.pos);
  }

  center(out) { return out.set(this.pos.x, this.pos.y + (this.T.fly ? 0 : this.height * 0.5), this.pos.z); }

  setState(s) { this.state = s; this.stateT = 0; }

  damage(n, from) {
    if (this.dead) return;
    this.hp -= n; this.flash = 1; this.hurtT = 4; this.alert = true;
    if (this.state === 'idle') this.setState('chase');
    if (this.hp <= 0) this.die();
  }

  die() {
    const g = this.game;
    this.dead = true; this.setState('dead');
    const c = this.center(new THREE.Vector3());
    const b = this.T.bolt || [0.5, 1, 0.9];
    g.particles.burst(c, this.T.kind === 'boss' ? 160 : 26, this.T.kind === 'boss' ? 16 : 6, 1.1, this.T.kind === 'boss' ? 3 : 1.0, b[0], b[1], b[2], { gravity: 4 });
    for (const d of this.T.drops) {
      if (Math.random() > d[3]) continue;
      const n = d[1] + Math.floor(Math.random() * (d[2] - d[1] + 1));
      for (let i = 0; i < n; i++) g.combat.spawnLoot(c, d[0]);
    }
    g.audio.play(this.T.kind === 'boss' ? 'boom' : 'die');
    g.onCreatureDeath(this);
  }

  // Steering with ground following, water avoidance and wall collision.
  moveToward(tx, tz, speed, dt) {
    const w = this.game.world;
    const dx = tx - this.pos.x, dz = tz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.05) { this.moveSpeed = 0; return; }
    const want = Math.atan2(dx, dz);
    this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * 7);
    const step = Math.min(d, speed * dt);
    const nx = this.pos.x + Math.sin(this.yaw) * step, nz = this.pos.z + Math.cos(this.yaw) * step;
    if (!this.T.fly) {
      if (!w.walkable(nx, nz, this.pos.y)) { this.moveSpeed = 0; this.yaw += dt * 2.5 * this.strafe; return; }
    } else if (w.solidAt(nx, this.pos.y, nz)) { this.moveSpeed = 0; this.yaw += dt * 2.5 * this.strafe; return; }
    this.pos.x = nx; this.pos.z = nz;
    w.resolve(this.pos, this.radius * 0.7, this.pos.y - (this.T.fly ? this.alt : 0), this.pos.y + this.height);
    this.moveSpeed = speed;
  }

  faceTarget(tx, tz, dt, rate = 8) {
    this.yaw += angDiff(this.yaw, Math.atan2(tx - this.pos.x, tz - this.pos.z)) * Math.min(1, dt * rate);
  }

  update(dt) {
    const g = this.game, p = g.player, w = g.world, T = this.T;
    this.t += dt; this.stateT += dt; this.cool -= dt; this.hurtT -= dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.model.mat.uniforms.uFlash.value = this.flash * 0.7;
    if (this.dead) {
      const k = Math.max(0, 1 - this.stateT / 0.7);
      this.group.scale.multiplyScalar(0.9 + 0.1 * k);
      this.group.position.y -= dt * 0.6;
      if (this.stateT > 0.7) this.remove = true;
      return;
    }
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz), dy = p.pos.y - this.pos.y;
    const safe = w.safeAt && w.safeAt(p.pos.x, p.pos.z) && T.kind !== 'boss';
    const sees = !p.dead && !safe && dist < T.aggro * (this.alert ? 1.5 : 1) && Math.abs(dy) < 30;
    this.moveSpeed = 0;
    const ground = () => w.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);

    if (T.kind === 'boss') this.updateBoss(dt, dist, dx, dz);
    else if (this.state === 'idle') {
      if (sees) { this.alert = true; this.setState('chase'); if (dist < 30) g.audio.play('alert'); }
      else {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 2 + Math.random() * 4; const a = Math.random() * TAU, r = Math.random() * 9; this.wx = this.home.x + Math.cos(a) * r; this.wz = this.home.z + Math.sin(a) * r; }
        if (Math.hypot(this.wx - this.pos.x, this.wz - this.pos.z) > 0.6) this.moveToward(this.wx, this.wz, T.speed * 0.3, dt);
      }
    } else if (this.state === 'chase') {
      if (!sees) { if (this.stateT > 3) { this.alert = false; this.setState('idle'); } }
      else if (T.kind === 'ranged') {
        const ideal = 11;
        if (dist > ideal + 3) this.moveToward(p.pos.x, p.pos.z, T.speed, dt);
        else if (dist < ideal - 4) this.moveToward(this.pos.x - dx, this.pos.z - dz, T.speed * 0.8, dt);
        else {
          const sx = this.pos.x + (-dz / dist) * 4 * this.strafe, sz = this.pos.z + (dx / dist) * 4 * this.strafe;
          this.moveToward(sx, sz, T.speed * 0.55, dt);
          if (Math.random() < dt * 0.3) this.strafe *= -1;
        }
        this.faceTarget(p.pos.x, p.pos.z, dt);
        if (this.cool <= 0 && dist < T.range) this.setState('windup');
      } else {
        if (T.kind === 'charger' && this.cool <= 0 && dist > 7 && dist < 18) this.setState('windup');
        else if (dist > T.range * 0.8 + p.radius) this.moveToward(p.pos.x, p.pos.z, T.speed, dt);
        else { this.faceTarget(p.pos.x, p.pos.z, dt); if (this.cool <= 0) this.setState('windup'); }
      }
    } else if (this.state === 'windup') {
      this.faceTarget(p.pos.x, p.pos.z, dt, 10);
      const wt = T.kind === 'slam' ? 0.7 : T.kind === 'charger' && dist > 5 ? 0.6 : T.kind === 'ranged' ? 0.45 : 0.32;
      if (this.stateT >= wt) {
        if (T.kind === 'ranged') {
          const c = this.center(new THREE.Vector3());
          const tgt = new THREE.Vector3(p.pos.x + p.vel.x * 0.35, p.pos.y + 1.0, p.pos.z + p.vel.z * 0.35);
          g.combat.enemyBolt(c, tgt.sub(c).normalize(), 17, T.dmg * this.dmgMul, T.bolt);
          g.audio.play('eshot', 0.5);
          this.cool = T.cool * (0.8 + Math.random() * 0.5);
          this.setState('chase');
        } else if (T.kind === 'charger' && dist > 5) {
          this.chargeDir.set(dx / dist, 0, dz / dist);
          this.setState('charge');
        } else {
          this.setState('strike');
          const reach = T.kind === 'slam' ? 5.0 : T.range + 0.7;
          const d3 = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
          if (T.kind === 'slam') {
            g.particles.burst(new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * 1.6, this.pos.y + 0.2, this.pos.z + Math.cos(this.yaw) * 1.6), 40, 9, 0.7, 1.4, 1, 0.7, 0.3, { gravity: 9 });
            g.shake(0.5);
            g.audio.play('slam');
            if (d3 < reach && p.onGround) p.damage(T.dmg * this.dmgMul, this.pos);
          } else if (d3 < reach && Math.abs(dy) < 2.2) { p.damage(T.dmg * this.dmgMul, this.pos); g.audio.play('bite', 0.6); }
          this.cool = T.cool;
        }
      }
    } else if (this.state === 'charge') {
      const sp = 19;
      const nx = this.pos.x + this.chargeDir.x * sp * dt, nz = this.pos.z + this.chargeDir.z * sp * dt;
      if (w.walkable(nx, nz, this.pos.y)) { this.pos.x = nx; this.pos.z = nz; }
      else this.stateT = 9;
      this.moveSpeed = sp;
      this.yaw = Math.atan2(this.chargeDir.x, this.chargeDir.z);
      if (dist < this.radius + 1.0 && Math.abs(dy) < 2 && this.stateT < 8) { p.damage(T.dmg * 1.25 * this.dmgMul, this.pos); p.knock(this.chargeDir.x * 9, 5, this.chargeDir.z * 9); this.stateT = 9; }
      if (this.stateT > 0.75) { this.cool = T.cool * 2.2; this.setState('strike'); }
    } else if (this.state === 'strike') {
      if (this.stateT > 0.35) this.setState('chase');
    }

    // vertical placement
    const gy = ground();
    if (T.fly) {
      const target = Math.max(gy, w.flyFloor ?? -1e9) + this.alt + Math.sin(this.t * 1.3) * 0.35;
      this.pos.y += (target - this.pos.y) * Math.min(1, dt * 2.5);
    } else this.pos.y += (gy - this.pos.y) * Math.min(1, dt * 14);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw;
    this.model.anim(this, dt);
    if (T.fly && this.hurtT > 0 || T.kind === 'boss') {
      const b = T.bolt;
      addLight(this.pos.x, this.pos.y, this.pos.z, T.kind === 'boss' ? 30 : 7, b[0] * 0.9, b[1] * 0.9, b[2] * 0.9);
    }
  }

  // The Warden: orbits the Spire, alternating volleys, shard rain and a ground ring.
  updateBoss(dt, dist, dx, dz) {
    const g = this.game, p = g.player, T = this.T;
    this.bossT += dt;
    this.enraged = this.hp < this.maxHp * 0.45;
    const cx = this.home.x, cz = this.home.z;
    const a = this.bossT * (this.enraged ? 0.42 : 0.28);
    const R = 16;
    const tx = cx + Math.cos(a) * R, tz = cz + Math.sin(a) * R;
    this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 1.5);
    this.pos.z += (tz - this.pos.z) * Math.min(1, dt * 1.5);
    this.faceTarget(p.pos.x, p.pos.z, dt, 5);
    if (p.dead || Math.hypot(p.pos.x - cx, p.pos.z - cz) > 60) { this.hp = Math.min(this.maxHp, this.hp + dt * 40); return; }
    const c = this.center(new THREE.Vector3());
    if (this.state === 'idle' || this.state === 'chase') {
      if (this.cool <= 0) { this.attack = (this.attack || 0) + 1; this.volley = 0; this.setState('windup'); g.audio.play('alert'); }
    } else if (this.state === 'windup') {
      const kind = this.attack % 3;
      if (this.stateT > 0.8) {
        if (kind === 0) {
          // aimed volley
          this.volley += dt;
          const every = this.enraged ? 0.16 : 0.24;
          if (this.volley > every) {
            this.volley = 0;
            const tgt = new THREE.Vector3(p.pos.x + p.vel.x * 0.5 + (Math.random() - 0.5) * 2.5, p.pos.y + 1, p.pos.z + p.vel.z * 0.5 + (Math.random() - 0.5) * 2.5);
            g.combat.enemyBolt(c, tgt.sub(c).normalize(), 24, T.dmg, T.bolt);
            g.audio.play('eshot', 0.5);
          }
          if (this.stateT > 2.6) { this.cool = this.enraged ? 1.2 : 2.0; this.setState('chase'); }
        } else if (kind === 1) {
          // radial burst
          const n = this.enraged ? 22 : 16;
          for (let i = 0; i < n; i++) {
            const an = (i / n) * TAU + this.bossT;
            const d = new THREE.Vector3(Math.cos(an), -0.42, Math.sin(an)).normalize();
            g.combat.enemyBolt(c, d, 15, T.dmg * 0.8, [0.5, 1, 1]);
          }
          g.audio.play('eshot');
          this.cool = this.enraged ? 1.4 : 2.2; this.setState('chase');
        } else {
          // summon sentinels (capped)
          const alive = g.creatures.filter((k) => !k.dead && k.type === 'sentinel').length;
          const n = Math.max(0, (this.enraged ? 3 : 2) - alive);
          for (let i = 0; i < n; i++) {
            const an = Math.random() * TAU;
            g.spawnCreature('sentinel', cx + Math.cos(an) * 14, this.game.world.groundAt(cx + Math.cos(an) * 14, cz + Math.sin(an) * 14, 1e4) + 2, cz + Math.sin(an) * 14, { hpMul: 0.7 });
          }
          g.particles.burst(c, 50, 12, 0.9, 1.6, 0.5, 1, 1, { gravity: 0 });
          this.cool = 2.4; this.setState('chase');
        }
      }
    }
  }
}

// Keeps the wilds populated around the player on open worlds.
export class Spawner {
  constructor(game) { this.game = game; this.timer = 4; }

  pick(sp, night, s) {
    const wC = sp[0], wE = sp[1], wM = sp[2], wB = Math.max(0, 1 - wC - wE - wM);
    const early = s.suit < 1;
    const r = Math.random();
    if (this.game.world.def.kind === 'korr') return 'borer';
    if (early) return night > 0.5 || r < 0.5 ? 'skitter' : null;
    if (wC > 0.5) return r < 0.5 ? 'drifter' : r < 0.85 ? 'skitter' : 'stalker';
    if (wE > 0.5) return r < 0.45 ? 'stalker' : 'skitter';
    if (wM > 0.5) return r < 0.35 ? 'stalker' : r < 0.65 ? 'drifter' : 'skitter';
    if (night > 0.5) return r < 0.6 ? 'skitter' : r < 0.8 ? 'stalker' : 'drifter';
    return r < 0.6 ? 'skitter' : r < 0.75 ? 'drifter' : null;
  }

  update(dt) {
    const g = this.game, w = g.world, p = g.player, s = g.state;
    if (w.type !== 'planet') return;
    for (const c of g.creatures) {
      if (c.T.kind === 'boss') continue;
      if (Math.hypot(c.pos.x - p.pos.x, c.pos.z - p.pos.z) > 130) c.remove = true;
    }
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 2.5;
    if (!s.unlocks.gauntlet) return;
    const night = g.sky.night;
    const cap = (s.suit < 1 ? 3 : 6) + (night > 0.5 ? 3 : 0);
    const wild = g.creatures.filter((c) => !c.dead && c.T.kind !== 'boss' && !c.tag).length;
    if (wild >= cap) return;
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * TAU, d = 40 + Math.random() * 24;
      const x = p.pos.x + Math.cos(a) * d, z = p.pos.z + Math.sin(a) * d;
      if (!w.terrain.inBounds(x, z, 30)) continue;
      const h = w.terrain.heightAt(x, z);
      if (h < w.sea + 1.2) continue;
      if (w.safeAt(x, z, 22)) continue;
      const sp = w.terrain.splatAt(x, z, [0, 0, 0, 0]);
      const type = this.pick(sp, night, s);
      if (!type) return;
      const pack = type === 'skitter' ? 2 + Math.floor(Math.random() * 2) : 1;
      for (let i = 0; i < pack; i++) {
        const px = x + (Math.random() - 0.5) * 5, pz = z + (Math.random() - 0.5) * 5;
        const ph = w.terrain.heightAt(px, pz);
        if (ph < w.sea + 0.8) continue;
        g.spawnCreature(type, px, ph + (CREATURES[type].fly || 0), pz);
      }
      return;
    }
  }
}
