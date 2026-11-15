// 3D scene renderer (WebGL2): sun shadow pass, lit ground + instanced world, dynamic rigs, FX,
// roof fade / wall cut-away for interiors and an occlusion silhouette for the player's side.
// Ground coordinates (x, y) from the action layer map to world (x, height, z = y).
import { GLCore, Batch, PRIM, PAT, MAX_LIGHTS } from './glcore.js';
import { Camera3D, lookAt, ortho, mul4, xform4, v3, IDENT } from './math.js';
import { buildStatic, PAL, TOWER_TOP, DOOR_H } from './static.js';
import { emitCharacter, emitDog, emitVehicle, emitFacility, emitSegment, emitDiamond, hx } from './rigs.js';
import { ambientAt } from '../render/lighting.js';
import { createCanvas, ctx2d } from '../render/canvas.js';
import { RAMPS } from '../data/palette.js';
import { WORLD_W, WORLD_H } from '../data/places.js';

const WORLD = WORLD_W * 16;
const F = PAT.FLAT;
const DIRS = [Math.PI / 2, -Math.PI / 2, 0, Math.PI];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

const colorCache = new Map();
function parseColor(str) {
  let c = colorCache.get(str);
  if (c) return c;
  if (str[0] === '#') c = hx(str);
  else { const m = str.match(/[\d.]+/g) || [255, 255, 255]; c = [m[0] / 255, m[1] / 255, m[2] / 255]; }
  colorCache.set(str, c);
  return c;
}

// Sky state for a minute of the day: the sun arcs east -> south -> west, the moon sits north-west.
export function skyAt(minute) {
  const a = ambientAt(minute);
  const amb = [a[0] / 255, a[1] / 255, a[2] / 255];
  const lum = (amb[0] + amb[1] + amb[2]) / 3;
  const night = clamp((0.95 - lum) / 0.6, 0, 1);
  const m = ((minute % 1440) + 1440) % 1440;
  const t = (m - 330) / 840;
  let dir, sun;
  if (t > 0 && t < 1) {
    const e = Math.sin(Math.PI * t);
    dir = v3.norm([Math.cos(Math.PI * t) * 0.8, 0.2 + 0.8 * e, 0.42]);
    const k = smooth(0, 0.2, e) * 0.66;
    sun = [amb[0] * k, amb[1] * k, amb[2] * k];
  } else {
    const since = m >= 1170 ? m - 1170 : m + 270, until = m < 330 ? 330 - m : 1770 - m;
    const k = Math.min(1, since / 45, until / 45) * 0.5;
    dir = v3.norm([-0.5, 0.78, -0.25]);
    sun = [0.3 * k, 0.36 * k, 0.56 * k];
  }
  const sk = mix(0.56, 0.95, night), gk = mix(0.44, 0.62, night), fk = mix(1, 0.42, night);
  return {
    night, dir, sun,
    sky: [amb[0] * sk, amb[1] * sk, amb[2] * sk],
    gnd: [amb[0] * gk, amb[1] * gk, amb[2] * gk],
    fog: [0.8 * amb[0] * fk, 0.73 * amb[1] * fk, 0.62 * amb[2] * fk],
  };
}

export class Renderer3D {
  constructor(canvas, W, terrain) {
    this.canvas = canvas;
    this.W = W;
    this.terrain = terrain;
    const core = this.core = new GLCore(canvas);
    this.cam = new Camera3D();
    this.cam.update(16 / 9);
    const st = buildStatic(W);
    this.chunkCount = st.chunks.map((b) => b.count);
    this.instances = this.chunkCount.reduce((a, b) => a + b, 0);
    this.chunks = st.chunks.map((b) => core.staticBatch(b));
    this.lights = st.lights;
    this.labels = st.labels;
    this.dyn = new Batch(4096);
    this.hero = new Batch(512);
    this.fxb = new Batch(2048);
    this.tex = new Array(64).fill(null);
    this.texSrc = new Array(64).fill(null);
    this.fade = new Map();
    this.doorFace = new Map();
    for (const b of W.buildings) for (const d of b.doors) this.doorFace.set(d.y * WORLD_W + d.x, d.f);
    this.lp = new Float32Array(MAX_LIGHTS * 4);
    this.lc = new Float32Array(MAX_LIGHTS * 4);
    this.ln = 0;
    this.cand = [];
    this.hideA = new Float32Array(4);
    this.hideB = new Float32Array(4);
    this.viewR = 600;
    this.env = skyAt(720);
    this.initGround();
  }

  // 64 chunk quads textured with the baked terrain + a tiled ash apron around the map.
  initGround() {
    const core = this.core, gl = core.gl;
    const v = [];
    const quad = (x0, z0, x1, z1, u0, v0, u1, v1) => v.push(x0, 0, z1, u0, v1, x1, 0, z1, u1, v1, x1, 0, z0, u1, v0, x0, 0, z1, u0, v1, x1, 0, z0, u1, v0, x0, 0, z0, u0, v0);
    for (let cy = 0; cy < 8; cy++) for (let cx = 0; cx < 8; cx++) quad(cx * 256, cy * 256, cx * 256 + 256, cy * 256 + 256, 0, 0, 1, 1);
    const E = 2200, S = 64;
    const ap = (x0, z0, x1, z1) => quad(x0, z0, x1, z1, x0 / S, z0 / S, x1 / S, z1 / S);
    ap(-E, -E, WORLD + E, 0); ap(-E, WORLD, WORLD + E, WORLD + E); ap(-E, 0, 0, WORLD); ap(WORLD, 0, WORLD + E, WORLD);
    this.groundBuf = gl.createBuffer();
    gl.bindVertexArray(core.groundVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.groundBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    // Apron: dithered ash, tiles every 64 world units.
    const can = createCanvas(64, 64);
    const g = ctx2d(can);
    const cols = [RAMPS.ink[2], RAMPS.ink[3], RAMPS.ink[2], RAMPS.bone[0], RAMPS.ink[1]];
    let seed = 1234567;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const r = rnd(); g.fillStyle = cols[r < 0.52 ? 0 : r < 0.8 ? 1 : r < 0.93 ? 2 : r < 0.97 ? 3 : 4]; g.fillRect(x, y, 1, 1); }
    this.apronTex = core.texture(can, null, true);
  }

  // Upload (or refresh) ground chunk textures whose baked canvas changed.
  syncGround(max = 64) {
    let n = 0;
    for (let i = 0; i < 64 && n < max; i++) {
      const src = this.terrain.chunks[i];
      if (src && this.texSrc[i] !== src) { this.tex[i] = this.core.texture(src, this.tex[i]); this.texSrc[i] = src; n++; }
    }
    return n;
  }

  // Canvas-pixel position of a world point (ground x/y + height); null when behind the camera.
  project(x, h, y) {
    const p = this.cam.project(x, h, y);
    if (p.w <= 0.01) return null;
    return { x: (p.x * 0.5 + 0.5) * this.canvas.width, y: (0.5 - p.y * 0.5) * this.canvas.height, w: p.w };
  }

  // Ground point under a canvas pixel, on the plane at height h.
  pick(mx, my, h = 0) {
    const g = this.cam.groundPoint((mx / Math.max(1, this.canvas.width)) * 2 - 1, 1 - (my / Math.max(1, this.canvas.height)) * 2, h);
    return { x: g.x, y: g.z };
  }

  updateFades(sc) {
    const W = this.W;
    let inB = -1;
    if (sc.focus) {
      const tx = Math.floor(sc.focus.x / 16), ty = Math.floor(sc.focus.y / 16);
      if (tx >= 0 && ty >= 0 && tx < WORLD_W && ty < WORLD_H) inB = W.bldg[ty * WORLD_W + tx];
    }
    if (inB >= 0 && !this.fade.has(inB)) this.fade.set(inB, 1);
    const k = Math.min(1, (sc.dt || 1 / 60) * 9);
    let a = null, b = null;
    for (const [id, v] of this.fade) {
      const nv = v + ((id === inB ? 0 : 1) - v) * k;
      if (id !== inB && nv > 0.985) { this.fade.delete(id); continue; }
      this.fade.set(id, nv);
      if (!a || nv < a[1]) { b = a; a = [id, nv]; } else if (!b || nv < b[1]) b = [id, nv];
    }
    const put = (out, h) => { out[0] = h ? h[0] + 1 : 0; out[1] = h ? h[1] : 1; out[2] = 7; out[3] = 0; };
    put(this.hideA, a); put(this.hideB, b);
  }

  collectLights(sc, env) {
    const cand = this.cand;
    cand.length = 0;
    const t = this.cam.target;
    const nk = env.night;
    if (nk > 0.03) {
      const R = Math.min(this.viewR + 160, 900);
      for (const l of this.lights) {
        const d = Math.hypot(l.x - t[0], l.z - t[2]);
        if (d > R) continue;
        const fl = l.flicker ? 0.9 + 0.22 * Math.sin(sc.time * 11 + l.x) * Math.sin(sc.time * 7.3 + l.z) : 1;
        cand.push({ x: l.x, y: l.y, z: l.z, r: l.r, c: l.c, k: nk * fl, d });
      }
    }
    if (sc.act) {
      sc.act.lights({ add: (x, y, r, col, k = 1, h = 0) => {
        cand.push({ x, y: h + 3, z: y, r: r * 2.6, c: parseColor(col), k: k * (0.55 + 0.45 * nk), d: Math.hypot(x - t[0], y - t[2]) - 500 });
      } });
    }
    cand.sort((p, q) => p.d - q.d);
    const n = Math.min(MAX_LIGHTS, cand.length);
    for (let i = 0; i < n; i++) {
      const l = cand[i], o = i * 4;
      this.lp[o] = l.x; this.lp[o + 1] = l.y; this.lp[o + 2] = l.z; this.lp[o + 3] = l.r;
      this.lc[o] = l.c[0] * l.k; this.lc[o + 1] = l.c[1] * l.k; this.lc[o + 2] = l.c[2] * l.k; this.lc[o + 3] = 1;
    }
    this.ln = n;
  }

  // ---------- dynamic geometry ----------
  buildDynamic(sc) {
    const dyn = this.dyn, hero = this.hero, fxb = this.fxb;
    dyn.reset(); hero.reset(); fxb.reset();
    const time = sc.time;
    const t = this.cam.target;
    const R = this.viewR + 80;
    const near = (x, y) => Math.abs(x - t[0]) < R && Math.abs(y - t[2]) < R;
    const B = (b, x, y, z, w, h, d, c, pat = F, em = 0, al = 1) => b.add(PRIM.CUBE, IDENT, x, y, z, w, h, d, c, pat, em, al);
    const C = (b, x, y, z, w, h, d, c, pat = F, em = 0, al = 1) => b.add(PRIM.CYL, IDENT, x, y, z, w, h, d, c, pat, em, al);
    const K = PAL;

    // Hollow grid: facilities, plants, need markers, free-cell frames.
    if (sc.cells) for (const c of sc.cells) {
      if (!near(c.x + 16, c.z + 16)) continue;
      if (!c.cell) {
        const col = K.bone[1];
        B(fxb, c.x + 1, 0.2, c.z + 1, 30, 0.5, 0.8, col, F, 0, 0.45); B(fxb, c.x + 1, 0.2, c.z + 30.2, 30, 0.5, 0.8, col, F, 0, 0.45);
        B(fxb, c.x + 1, 0.2, c.z + 1.8, 0.8, 0.5, 28.4, col, F, 0, 0.45); B(fxb, c.x + 30.2, 0.2, c.z + 1.8, 0.8, 0.5, 28.4, col, F, 0, 0.45);
        continue;
      }
      emitFacility(dyn, c.cell, c.x, c.z, c.info);
      if (c.info.thirsty) B(fxb, c.x + 25, 17 + Math.sin(time * 5) * 1.2, c.z + 4, 2.6, 3.4, 2.6, K.heat[2], F, 1);
      if (c.info.stage === 4) emitDiamond(fxb, c.x + 16, 25, c.z + 16, 3.4, K.gold[3], time);
    }
    const A = sc.act;
    if (!A) return;
    const P = A.player;

    // Characters.
    if (!P.vehicle) {
      emitCharacter(P.alive ? hero : dyn, {
        x: P.x, z: P.y, y0: 0, face: P.rollT > 0 ? P.rollA : P.face, look: sc.playerLook, moving: P.moving && P.alive, anim: P.anim,
        sneak: P.sneaking, sprint: P.sprint, roll: P.rollT > 0 ? 1 - P.rollT / 0.32 : null, down: !P.alive, flash: P.hurtT > 0 ? P.hurtT : 0,
        gun: sc.playerGun || null, aim: true, time, id: 0,
      });
    }
    for (const e of A.ents) {
      if (!near(e.x, e.y) || e.turret) continue;
      if (e.prop) { if (e.alive) this.objectModel(dyn, e, time); continue; }
      const b = e.faction === 'crew' && e.alive ? hero : dyn;
      const face = e.face !== undefined && e.face === e.face ? e.face : DIRS[e.dir || 0];
      if (e.dog) { emitDog(b, { x: e.x, z: e.y, face, moving: e.moving, anim: e.anim, down: !e.alive, flash: e.flashT, ramp: e.faction === 'compact' ? 'ink' : 'wood' }); continue; }
      const ai = e.ai || {};
      const armed = e.weapon && e.weapon.st ? e.weapon.st.family : null;
      const y0 = e.elevated ? TOWER_TOP : 0;
      emitCharacter(b, {
        x: e.x, z: e.y, y0, face, look: e.look || sc.playerLook, moving: e.moving && e.alive, anim: e.anim, sneak: false, sprint: false, roll: null,
        down: !e.alive, flash: e.flashT > 0 ? e.flashT : 0, gun: e.alive ? armed : null,
        aim: !!armed && (ai.state === 'hunt' || !!e.laser || (e.lastShot !== undefined && A.time - e.lastShot < 1.2)),
        shield: !!(e.A && e.A.shield), scale: e.boss ? 1.22 : 1, time, id: e.id || 0,
      });
      if (e.laser && e.alive) emitSegment(fxb, [e.x, y0 + 12.5, e.y], [e.laser.x, 9, e.laser.y], 0.5, K.heat[2], 1, 0.7);
      if (e.shielded && e.alive) C(fxb, e.x - 12, 0, e.y - 12, 24, 27, 24, K.teal[3], F, 0.6, 0.28 + 0.06 * Math.sin(time * 6));
    }
    for (const v of A.vehicles) if (near(v.x, v.y)) emitVehicle(dyn, v);

    // Pickups: a small gold-banded satchel that bobs and glints.
    for (const pk of A.pickups) {
      if (!near(pk.x, pk.y)) continue;
      const bob = 1.2 + Math.sin(time * 4 + pk.x) * 0.8;
      B(dyn, pk.x - 3, bob, pk.y - 2.2, 6, 3.6, 4.4, K.wood[1]);
      B(dyn, pk.x - 3.2, bob + 1.2, pk.y - 2.4, 6.4, 1, 4.8, K.gold[2], F, 0.5);
      if (Math.sin(time * 4 + pk.x) > 0.55) B(fxb, pk.x + 1, bob + 5, pk.y - 0.5, 1, 2.2, 1, K.gold[3], F, 1);
    }

    // Night-locked HQ doors.
    for (const idx of A.locks) {
      const tx = idx % WORLD_W, ty = Math.floor(idx / WORLD_W);
      if (!near(tx * 16 + 8, ty * 16 + 8)) continue;
      const f = this.doorFace.get(idx) || 'S';
      if (f === 'N' || f === 'S') { B(dyn, tx * 16 + 2.5, 0, ty * 16 + 6, 11, DOOR_H, 4, K.wood[1], PAT.PLANK); B(dyn, tx * 16 + 10.5, 10, ty * 16 + (f === 'S' ? 10 : 4.6), 1.6, 2.4, 1.4, K.gold[2]); }
      else { B(dyn, tx * 16 + 6, 0, ty * 16 + 2.5, 4, DOOR_H, 11, K.wood[1], PAT.PLANK); B(dyn, tx * 16 + (f === 'E' ? 10 : 4.6), 10, ty * 16 + 10.5, 1.4, 2.4, 1.6, K.gold[2]); }
    }

    // Missions: objective beacons, artillery marks, target marker, squad order marker.
    const MR = A.missions;
    for (const m of MR.marks) {
      const r = Math.max(4, 32 * (1 - m.t / 3));
      C(fxb, m.x - r, 0.25, m.y - r, r * 2, 0.5, r * 2, K.heat[2], F, 1, 0.3 + 0.2 * Math.sin(m.t * 12));
    }
    for (const o of MR.objs) {
      const e = o.ent;
      if (e && !e.alive) continue;
      const x = e ? e.x : o.x, y = e ? e.y : o.y;
      if (!near(x, y)) continue;
      emitDiamond(fxb, x, 33, y, 4, K.gold[3], time);
      if (!e) C(fxb, x - o.r, 0.2, y - o.r, o.r * 2, 0.4, o.r * 2, K.gold[2], F, 0.8, 0.22);
    }
    const M = A.S.mission;
    if (M && M.targetEnt && M.targetEnt.alive) emitDiamond(fxb, M.targetEnt.x, 35, M.targetEnt.y, 4.2, K.heat[2], time);
    const so = A.squadOrder;
    if (so && (so.kind === 'hold' || so.kind === 'breach') && so.x !== undefined) emitDiamond(fxb, so.x, 5, so.y, 2.6, K.teal[3], time);

    // Interaction focus: pulsing ground brackets + a beacon.
    const f = sc.showFocus ? A.focus : null;
    if (f) {
      const r = f.kind === 'cell' ? 16.5 : 9, col = K.bone[3];
      const s = r + Math.sin(time * 6) * 0.8, L = Math.max(3.5, r * 0.5), th = 1, y = 0.4;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const cx = f.x + sx * s, cz = f.y + sz * s;
        B(fxb, sx < 0 ? cx : cx - L, y, cz - th / 2, L, th, th, col, F, 1);
        B(fxb, cx - th / 2, y, sz < 0 ? cz : cz - L, th, th, L, col, F, 1);
      }
      if (f.kind !== 'cell' && !f.ent && !f.pk) emitDiamond(fxb, f.x, f.prop ? 27 : 31, f.y, 2.4, col, time);
    }

    // Combat: tracers, thrown items, zones, muzzle flashes.
    const CB = A.combat;
    for (const b of CB.bullets) {
      if (!b.on) continue;
      const h = CB.bulletHeight(b);
      const sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
      emitSegment(fxb, [b.x - ux * 10, h, b.y - uy * 10], [b.x, h, b.y], 0.9, b.variant === 'inc' ? K.heat[3] : K.gold[3], 1);
    }
    for (const th of CB.throws) {
      const c = th.type === 'molotov' ? K.heat[3] : th.type === 'smokepot' ? K.bone[2] : K.ink[3];
      B(fxb, th.x - 1.6, th.h, th.y - 1.6, 3.2, 3.2, 3.2, K.ink[0]);
      B(fxb, th.x - 0.9, th.h + 3, th.y - 0.9, 1.8, 1.8, 1.8, c, F, th.type === 'molotov' ? 1 : 0);
    }
    CB.zones.forEach((z, zi) => {
      if (!near(z.x, z.y)) return;
      const a = Math.min(1, z.t / 1.5);
      if (z.type === 'fire') {
        C(fxb, z.x - z.r, 0.15, z.y - z.r, z.r * 2, 0.4, z.r * 2, K.heat[1], F, 0.7, 0.5 * a);
        for (let k = 0; k < 5; k++) {
          const ph = time * (5 + k) + k * 2.1 + zi, rr = z.r * (0.25 + 0.5 * ((k * 0.37) % 1));
          const fx = z.x + Math.cos(k * 2.4 + zi) * rr, fy = z.y + Math.sin(k * 2.4 + zi) * rr, fh = (5 + 4 * Math.abs(Math.sin(ph))) * a;
          B(fxb, fx - 1.6, 0.4, fy - 1.6, 3.2, fh, 3.2, K.heat[2], F, 1); B(fxb, fx - 0.8, 0.4 + fh, fy - 0.8, 1.6, fh * 0.5, 1.6, K.gold[3], F, 1);
        }
      } else if (z.type === 'caltrops') {
        for (let k = 0; k < 9; k++) B(fxb, z.x + Math.cos(k * 2.4) * z.r * 0.7 * ((k % 3) / 3 + 0.3) - 0.6, 0, z.y + Math.sin(k * 2.4) * z.r * 0.7 * ((k % 3) / 3 + 0.3) - 0.6, 1.2, 2, 1.2, K.ink[3]);
      } else {
        const al = Math.min(1, z.t / 2) * 0.55;
        for (let k = 0; k < 7; k++) {
          const ph = time * 0.5 + k * 1.7 + zi, rr = z.r * (0.15 + 0.55 * ((k * 0.61) % 1)), s = z.r * (0.5 + 0.25 * Math.sin(ph * 1.3));
          C(fxb, z.x + Math.cos(ph) * rr - s / 2, 2 + (k % 3) * 6, z.y + Math.sin(ph) * rr - s / 2, s, s * 0.8, s, k & 1 ? K.bone[1] : K.bone[0], F, 0, al);
        }
      }
    });
    for (const fl of A.flashes) B(fxb, fl.x - 1.5 * fl.k, fl.h - 1.5 * fl.k, fl.y - 1.5 * fl.k, 3 * fl.k, 3 * fl.k, 3 * fl.k, K.gold[3], F, 1, 0.8);

    // Particles (height-aware).
    const fx = sc.fx;
    if (fx) for (const q of fx.p) {
      if (!q.on) continue;
      const s = fx.size(q) * 1.25;
      fxb.add(PRIM.CUBE, IDENT, q.x - s / 2, q.z, q.y - s / 2, s, s, s, hx(q.c), F, q.kind === 2 ? 0 : 1, fx.alpha(q));
    }
  }

  // Mission objects that are entities without a body: safes, sabotage targets, shield pylons.
  objectModel(b, e, time) {
    const K = PAL, x = e.x, z = e.y;
    const fl = e.flashT > 0 ? 0.8 : 0;
    const add = (dx, dy, dz, w, h, d, c, pat = F, em = 0) => b.add(PRIM.CUBE, IDENT, x + dx, dy, z + dz, w, h, d, c, pat, Math.max(em, fl));
    if (e.objKind === 'safe') {
      add(-7, 0, -6, 14, 15, 12, K.ink[2]); add(-5.5, 2, 6, 11, 11, 0.7, K.ink[1]); add(-1.6, 6, 6.6, 3.2, 3.2, 0.6, K.gold[2], F, 0.5); add(3.6, 5.5, 6.6, 1.2, 4, 0.6, K.gold[1]);
    } else if (e.objKind === 'pylon') {
      b.add(PRIM.CYL, IDENT, x - 6, 0, z - 6, 12, 3, 12, K.ink[2], PAT.CONCRETE, fl);
      b.add(PRIM.CYL, IDENT, x - 2.6, 3, z - 2.6, 5.2, 24, 5.2, K.teal[2], F, 0.55 + 0.25 * Math.sin(time * 5));
      b.add(PRIM.CYL, IDENT, x - 4, 27, z - 4, 8, 2.4, 8, K.teal[3], F, 1);
    } else {
      add(-7, 0, -6, 14, 10, 12, K.olive[1], PAT.CORR); add(-7.3, 6, -6.3, 14.6, 1.6, 12.6, K.heat[2], F, 0.7); add(3, 10, 2, 1, 9, 1, K.ink[2]); add(2.6, 19, 1.6, 1.8, 1.8, 1.8, K.heat[3], F, 1); add(-5, 10, -4, 6, 3, 5, K.ink[2]);
    }
  }

  // ---------- frame ----------
  // sc: { minute, time, dt, pixel, pixelScale, shadows, focus, act, fx, cells, playerLook, playerGun, showFocus }
  render(sc) {
    const core = this.core, gl = core.gl, cam = this.cam;
    const cw = this.canvas.width, ch = this.canvas.height;
    if (cw < 2 || ch < 2) return;
    const scale = sc.pixel ? Math.max(1, sc.pixelScale || 2) : 1;
    const tw = Math.max(2, Math.floor(cw / scale)), th = Math.max(2, Math.floor(ch / scale));
    const target = core.ensureTarget(tw, th, sc.pixel ? 0 : 4);
    cam.update(cw / ch);
    this.syncGround(3);
    const env = this.env = skyAt(sc.minute);
    const t = cam.target;
    let R = 0;
    for (const [nx, ny] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) { const g = cam.groundPoint(nx, ny, 0); R = Math.max(R, Math.hypot(g.x - t[0], g.z - t[2])); }
    R = Math.min(R, 1500);
    this.viewR = R;
    this.updateFades(sc);
    this.collectLights(sc, env);
    this.buildDynamic(sc);
    core.uploadDynamic(this.dyn); core.uploadDynamic(this.hero); core.uploadDynamic(this.fxb);

    // Sun/moon shadow map: ortho box around the camera target, snapped to texels.
    const ext = clamp(R * 1.08, 320, 640);
    const d = env.dir;
    const lv = lookAt([d[0] * 900, d[1] * 900, d[2] * 900], [0, 0, 0], Math.abs(d[1]) > 0.95 ? [0, 0, -1] : [0, 1, 0]);
    const c = xform4(lv, t[0], 0, t[2]);
    const texel = (ext * 2) / core.shadow.size;
    const lx = Math.round(c[0] / texel) * texel, ly = Math.round(c[1] / texel) * texel;
    const lvp = mul4(ortho(lx - ext, lx + ext, ly - ext, ly + ext, -c[2] - 780, -c[2] + 780), lv);
    const doShadow = !!sc.shadows && core.shadow.ok;
    const chunkNear = (i, r) => Math.hypot((i % 8) * 256 + 128 - t[0], (i >> 3) * 256 + 128 - t[2]) < r;
    gl.bindVertexArray(core.vao);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, null);
    if (doShadow) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, core.shadow.fbo);
      gl.viewport(0, 0, core.shadow.size, core.shadow.size);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.useProgram(core.depth.p);
      gl.uniformMatrix4fv(core.depth.u.uLVP, false, lvp);
      gl.uniform4fv(core.depth.u.uHideA, this.hideA); gl.uniform4fv(core.depth.u.uHideB, this.hideB);
      gl.cullFace(gl.FRONT);
      const sr = ext * 1.45 + 200;
      for (let i = 0; i < 64; i++) if (this.chunkCount[i] && chunkNear(i, sr)) core.drawBatch(this.chunks[i]);
      core.drawBatch(this.dyn); core.drawBatch(this.hero);
      gl.cullFace(gl.BACK);
    }

    // Main pass.
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.viewport(0, 0, tw, th);
    gl.clearColor(env.fog[0], env.fog[1], env.fog[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const L = { sunDir: d, sunCol: env.sun, ambSky: env.sky, ambGnd: env.gnd, fog: env.fog, eye: cam.eye, fogRange: [cam.dist * 1.7 + 300, cam.dist * 2.6 + 1200], lp: this.lp, lc: this.lc, ln: this.ln, shadows: doShadow, night: env.night };
    gl.bindTexture(gl.TEXTURE_2D, core.shadow.tex);
    gl.activeTexture(gl.TEXTURE0);
    const vr = R + 190;
    gl.useProgram(core.ground.p);
    gl.uniformMatrix4fv(core.ground.u.uVP, false, cam.vp);
    gl.uniformMatrix4fv(core.ground.u.uLVP, false, lvp);
    gl.uniform1i(core.ground.u.uTex, 0);
    core.setLighting(core.ground, L);
    gl.bindVertexArray(core.groundVao);
    gl.bindTexture(gl.TEXTURE_2D, this.apronTex);
    gl.drawArrays(gl.TRIANGLES, 64 * 6, 24);
    for (let i = 0; i < 64; i++) {
      if (!this.tex[i] || !chunkNear(i, vr)) continue;
      gl.bindTexture(gl.TEXTURE_2D, this.tex[i]);
      gl.drawArrays(gl.TRIANGLES, i * 6, 6);
    }
    gl.useProgram(core.inst.p);
    gl.uniformMatrix4fv(core.inst.u.uVP, false, cam.vp);
    gl.uniformMatrix4fv(core.inst.u.uLVP, false, lvp);
    gl.uniform4fv(core.inst.u.uHideA, this.hideA); gl.uniform4fv(core.inst.u.uHideB, this.hideB);
    gl.uniform4f(core.inst.u.uSil, 0, 0, 0, 0);
    core.setLighting(core.inst, L);
    gl.bindVertexArray(core.vao);
    let drawn = 0;
    for (let i = 0; i < 64; i++) if (this.chunkCount[i] && chunkNear(i, vr)) { core.drawBatch(this.chunks[i]); drawn += this.chunkCount[i]; }
    this.drawn = drawn + this.dyn.count + this.hero.count + this.fxb.count;
    core.drawBatch(this.dyn);
    // Player + squad: dithered silhouette where the world hides them, then the bodies themselves.
    if (this.hero.count) {
      const sil = PAL.teal[3];
      gl.depthFunc(gl.GREATER); gl.depthMask(false);
      gl.uniform4f(core.inst.u.uSil, sil[0], sil[1], sil[2], 1);
      core.drawBatch(this.hero);
      gl.depthFunc(gl.LESS); gl.depthMask(true);
      gl.uniform4f(core.inst.u.uSil, 0, 0, 0, 0);
      core.drawBatch(this.hero);
    }
    core.drawBatch(this.fxb);
    gl.bindVertexArray(null);
    core.present(target, cw, ch);
  }
}
