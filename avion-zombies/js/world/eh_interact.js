import * as THREE from '../../vendor/three.module.min.js';
import { boxGeometry } from './builder.js';
import { std, basic } from './materials.js';
import { makeSign } from './textures.js';
import { REACTOR_CONSOLE, ELEVATOR } from './eh_layout.js';
import { PIT, RIVER, LODGE } from './eh_shape.js';
import { audio } from '../engine/audio.js';
import { rand, clamp, distToSegment2 } from '../util.js';

// Ember Hollow's own interactables: the CALDERA start-up console and the service lift between
// the visitor center and the reactor. Plus the map's soundscape.

const CORE = new THREE.Vector3(PIT.x, -58, PIT.z);

export function interactables(game, Interactable) {
  const list = [new ReactorConsole(game, Interactable)];
  const shared = { busy: false, t: 0 };
  list.push(new LiftCar(game, Interactable, 'top', shared), new LiftCar(game, Interactable, 'bottom', shared));
  return list;
}

// ---- the CALDERA control console ----------------------------------------------------------------
function ReactorConsole(game, Interactable) {
  const d = REACTOR_CONSOLE;
  const I = new Interactable(game, new THREE.Vector3(d.x, d.floor + 1.15, d.z), 1.9);
  I.facing = new THREE.Vector3(Math.sin(d.rot), 0, Math.cos(d.rot));
  const M = game.world.materials;
  const g = new THREE.Group();
  g.position.set(d.x, d.floor, d.z);
  g.rotation.y = d.rot;
  // a raked panel on the desk: status screen, a row of lamps, the big start handle
  const panel = new THREE.Mesh(boxGeometry(1.5, 0.08, 0.7, 1), M.steelDark);
  panel.position.set(0, 1.02, -0.05);
  panel.rotation.x = -0.35;
  g.add(panel);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.6, 1.6, 1.6) });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), screenMat);
  screen.position.set(-0.15, 1.42, -0.32);
  screen.rotation.x = -0.25;
  g.add(screen);
  const lampMats = [];
  for (let k = 0; k < 6; k++) {
    const m = basic({ color: new THREE.Color(3, 0.3, 0.2) });
    lampMats.push(m);
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), m);
    l.position.set(-0.6 + k * 0.12, 1.1, 0.12);
    g.add(l);
  }
  const lever = new THREE.Group();
  lever.position.set(0.55, 1.08, 0.05);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), M.steel);
  arm.position.y = 0.18;
  const knob = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), M.redPaint);
  knob.position.y = 0.38;
  lever.add(arm, knob);
  lever.rotation.x = 0.7;
  g.add(lever);
  const tag = makeSign([{ text: 'CORE START', size: 60 }, { text: 'TWO-MAN RULE WAIVED', size: 28, weight: 600 }], { w: 256, h: 96, bg: '#e7e2d4', fg: '#a8241c', stripe: false });
  const tm = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13), std({ map: tag, roughness: 0.6 }));
  tm.position.set(0.55, 1.08, 0.24);
  tm.rotation.x = -0.35;
  g.add(tm);
  game.mapRoot.add(g);

  let state = 'idle';
  let t = 0;
  const draw = (lines, color) => {
    ctx.fillStyle = '#050c10';
    ctx.fillRect(0, 0, 256, 128);
    ctx.fillStyle = color;
    ctx.font = '600 20px monospace';
    lines.forEach((s, i) => ctx.fillText(s, 10, 26 + i * 24));
    tex.needsUpdate = true;
  };
  const idleScreen = () => draw(['CALDERA UNIT 1', 'CORE: COLD', 'TURBINES: STOPPED', '> AWAITING START'], '#ff8a5a');
  idleScreen();

  I.prompt = () => {
    if (state === 'online' || game.world.powered('reactor')) return null;
    if (state === 'starting') return { text: 'CALDERA starting up…', cost: null, disabled: true };
    return { text: 'Start the CALDERA reactor', cost: 0, sub: 'Brings power back to every level of the caverns' };
  };
  I.use = () => {
    if (state !== 'idle' || game.world.powered('reactor')) return;
    state = 'starting';
    t = 0;
    audio.play3D('breaker', I.pos, { volume: 1, refDistance: 4 });
    audio.play3D('reactor_start', CORE, { volume: 1.4, refDistance: 30 });
    audio.loop('calderaAlarm', 'alarm', { bus: 'ambience', volume: 0.22 });
    game.hud.message('CALDERA START-UP', 'Turbines spinning up…', 3);
  };
  I.update = (dt) => {
    if (state === 'starting') {
      t += dt;
      lever.rotation.x = 0.7 - Math.min(1, t * 3) * 1.4;
      const k = Math.min(1, t / 6.6);
      game.player.addShake(0.04 + k * 0.12, 0.2);
      lampMats.forEach((m, i) => (i / 6 < k ? m.color.setRGB(0.3, 3, 0.6) : m.color.setRGB(3, 0.3, 0.2)));
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
        const pct = Math.round(k * 100);
        draw(['CALDERA UNIT 1', `CORE TEMP ${Math.round(300 + k * 800)}°C`, `TURBINES ${Math.round(k * 3600)} RPM`, `> START ${pct}%`], '#ffd27a');
      }
      if (t >= 6.6) {
        state = 'online';
        audio.stopLoop('calderaAlarm', 2);
        game.turnOnCircuit('reactor');
      }
    } else if (state !== 'online' && game.world.powered('reactor')) {
      // powered some other way (free roam)
      state = 'online';
      lever.rotation.x = -0.7;
    }
    if (state === 'online' && !I._shown) {
      I._shown = true;
      lampMats.forEach((m) => m.color.setRGB(0.3, 3, 0.6));
      draw(['CALDERA UNIT 1', 'CORE: ONLINE', 'OUTPUT 410 MW', '> ALL LEVELS POWERED'], '#7aff9a');
    }
  };
  I.reset = () => {
    state = 'idle';
    t = 0;
    I._shown = false;
    lever.rotation.x = 0.7;
    lampMats.forEach((m) => m.color.setRGB(3, 0.3, 0.2));
    idleScreen();
    audio.stopLoop('calderaAlarm', 0.2);
  };
  return I;
}

// ---- the service lift ----------------------------------------------------------------------------
// Each end: a steel car behind sliding doors. The doors open for you when the reactor is on; the
// button inside sends the car to the other end.
const CARS = {
  top: { door: { x: -27.0, z: 25.2 }, axis: 'z', out: -1, floor: LODGE.floor, box: { x0: -26.85, x1: -24.62, z0: 24.0, z1: 26.4 }, yaw: Math.PI / 2 },
  bottom: { door: { x: 54, z: -199.6 }, axis: 'x', out: -1, floor: -66, box: { x0: 52.65, x1: 55.35, z0: -199.45, z1: -196.85 }, yaw: 0 },
};

function LiftCar(game, Interactable, end, shared) {
  const C = CARS[end];
  const other = CARS[end === 'top' ? 'bottom' : 'top'];
  const M = game.world.materials;
  const phys = game.world.physics;
  const b = C.box;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const y = C.floor;
  const g = new THREE.Group();
  game.mapRoot.add(g);
  const steel = std({ color: 0x9aa2a8, roughness: 0.35, metalness: 0.75 });
  const add = (geo, mat, x, yy, z, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, yy, z);
    m.rotation.y = ry;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  // the car: floor, ceiling with its light, walls (the door side is open)
  const w = b.x1 - b.x0;
  const d = b.z1 - b.z0;
  add(boxGeometry(w, 0.06, d, 1), M.steelDark, cx, y + 0.03, cz);
  add(boxGeometry(w, 0.08, d, 1), M.steelDark, cx, y + 2.6, cz);
  const walls = C.axis === 'z'
    ? [[cx, cz - d / 2 - 0.04, w, 0.08], [cx, cz + d / 2 + 0.04, w, 0.08], [b.x1 + 0.04, cz, 0.08, d]]
    : [[cx - w / 2 - 0.04, cz, 0.08, d], [cx + w / 2 + 0.04, cz, 0.08, d], [cx, b.z1 + 0.04, w, 0.08]];
  for (const [x, z, ww, dd] of walls) {
    add(boxGeometry(ww, 2.6, dd, 1), steel, x, y + 1.3, z);
    phys.addBox({ x, y, z, w: ww, h: 2.65, d: dd, walkable: false, material: 'metal' });
  }
  phys.addBox({ x: cx, y: y + 2.6, z: cz, w, h: 0.3, d, walkable: false, nav: false, material: 'metal' });
  // the portal around the doors (the lodge end sits in Avion's concrete wall already)
  if (end === 'bottom') {
    const pz = C.door.z - 0.15;
    for (const s of [-1, 1]) {
      add(boxGeometry(1.8, 3.6, 0.3, 2), M.concrete, C.door.x + s * 1.7, y + 1.8, pz);
      phys.addBox({ x: C.door.x + s * 1.7, y, z: pz, w: 1.8, h: 3.6, d: 0.3, walkable: false, material: 'concrete' });
    }
    add(boxGeometry(5.2, 1.2, 0.3, 2), M.concrete, C.door.x, y + 3.0, pz);
    add(boxGeometry(5.2, 0.3, 0.32, 2), M.hazard, C.door.x, y + 2.55, pz);
  }
  // the doors: two leaves sliding apart along the door plane
  const leaves = [];
  for (const s of [-1, 1]) {
    const leaf = add(boxGeometry(0.8, 2.4, 0.05, 1), steel, 0, y + 1.2, 0);
    leaves.push({ m: leaf, s });
  }
  const placeLeaves = (k) => {
    for (const { m, s } of leaves) {
      const off = s * (0.4 + 0.78 * k);
      if (C.axis === 'z') m.position.set(C.door.x - 0.02, y + 1.2, C.door.z + off);
      else m.position.set(C.door.x + off, y + 1.2, C.door.z + 0.02);
      m.rotation.y = C.axis === 'z' ? Math.PI / 2 : 0;
    }
  };
  placeLeaves(0);
  const doorCol = phys.addBox({ x: C.door.x, y, z: C.door.z, w: C.axis === 'z' ? 0.3 : 1.7, h: 2.5, d: C.axis === 'z' ? 1.7 : 0.3, walkable: false, material: 'metal' });
  // the call panel inside, a ceiling light that comes on with the reactor
  const panelPos = C.axis === 'z' ? new THREE.Vector3(b.x0 + 0.5, y + 1.3, b.z0 + 0.06) : new THREE.Vector3(b.x1 - 0.06, y + 1.3, b.z0 + 0.6);
  const panel = add(boxGeometry(0.3, 0.5, 0.04, 1), M.steelDark, panelPos.x, panelPos.y, panelPos.z, C.axis === 'z' ? 0 : -Math.PI / 2);
  const btnMat = basic({ color: new THREE.Color(0.4, 0.1, 0.05) });
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), btnMat);
  btn.rotation.x = Math.PI / 2;
  btn.position.set(0, 0.08, 0.03);
  panel.add(btn);
  const lampMat = basic({ color: new THREE.Color(2.2, 2.2, 2.2) });
  add(new THREE.BoxGeometry(1.0, 0.04, 0.3), lampMat, cx, y + 2.55, cz);
  // the car light joins the world's lamp pool (lit once the reactor is on)
  game.world.builder.lightAnchors.push({
    x: cx, y: y + 2.3, z: cz, color: new THREE.Color(0xe8f0ff), intensity: 0.9, distance: 5, flicker: 0, circuit: 'reactor',
    emergency: false, dimUnpowered: false, zone: -1, mesh: null, mat: lampMat, baseColor: lampMat.color.clone(),
  });
  lampMat.color.multiplyScalar(game.world.powered('reactor') ? 1 : 0.04);
  const sign = makeSign([{ text: end === 'top' ? '▼ CALDERA' : '▲ SURFACE', size: 60 }, { text: 'SERVICE LIFT', size: 30, weight: 600 }], { w: 256, h: 112, bg: '#1d2226', fg: '#ffb84a', stripe: false });
  const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.27), std({ map: sign, roughness: 0.6 }));
  if (C.axis === 'z') {
    sm.position.set(C.door.x - 0.2, y + 2.85, C.door.z);
    sm.rotation.y = -Math.PI / 2;
  } else {
    sm.position.set(C.door.x, y + 2.85, C.door.z - 0.32);
    sm.rotation.y = Math.PI;
  }
  g.add(sm);

  const I = new Interactable(game, panelPos.clone(), 1.3);
  I.facing = C.axis === 'z' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-1, 0, 0);
  let open = 0;
  const inside = (p) => p.x > b.x0 && p.x < b.x1 && p.z > b.z0 && p.z < b.z1;
  I.prompt = () => {
    if (!game.world.powered('reactor')) return { text: 'Service lift: no power', cost: null, disabled: true };
    if (shared.busy || shared.t > 0) return { text: 'Service lift on its way…', cost: null, disabled: true };
    return { text: end === 'top' ? 'Take the lift down to the CALDERA' : 'Take the lift up to the visitor center', cost: 0 };
  };
  I.use = () => {
    if (!game.world.powered('reactor') || shared.busy || shared.t > 0) return;
    const p = game.player;
    if (!inside(p.ch)) return;
    shared.busy = true;
    shared.ride = { from: end, t: 0, moved: false };
    p.rooted = true;
    p.invuln = Math.max(p.invuln, 6);
    audio.play('elevator', { volume: 0.9 });
    fade(1);
  };
  I.update = (dt) => {
    const powered = game.world.powered('reactor');
    btnMat.color.setRGB(powered ? 0.4 : 0.4, powered ? 3 : 0.1, powered ? 0.6 : 0.05);
    const p = game.player.ch;
    const near = Math.hypot(p.x - C.door.x, p.z - C.door.z) < 3.4 || inside(p);
    const ride = shared.ride;
    let want = powered && near && !shared.busy ? 1 : 0;
    if (ride && ride.from !== end && ride.moved && ride.t > 3.4) want = 1;
    open = clamp(open + (want ? dt : -dt) * 1.6, 0, 1);
    placeLeaves(open * open * (3 - 2 * open));
    doorCol.disabled = open > 0.6;
    if (ride && ride.from === end) {
      ride.t += dt;
      if (!ride.moved && ride.t > 2.4) {
        // arrive: same spot in the other car, facing its doors
        const ob = other.box;
        const P = game.player;
        P.ch.x = (ob.x0 + ob.x1) / 2;
        P.ch.z = (ob.z0 + ob.z1) / 2;
        P.ch.y = other.floor;
        P.ch.vx = P.ch.vy = P.ch.vz = 0;
        P.yaw = other.yaw;
        P.sync();
        ride.moved = true;
        fade(0);
      }
      if (ride.moved && ride.t > 3.6) {
        game.player.rooted = false;
        shared.busy = false;
        shared.ride = null;
        shared.t = 8;
      }
    }
    if (end === 'top' && shared.t > 0) shared.t = Math.max(0, shared.t - dt);
  };
  I.reset = () => {
    shared.busy = false;
    shared.ride = null;
    shared.t = 0;
    open = 0;
    placeLeaves(0);
    doorCol.disabled = false;
    fade(0, true);
  };
  return I;
}

// a black overlay for the ride
let fadeEl = null;
function fade(on, instant = false) {
  if (!fadeEl) {
    fadeEl = document.createElement('div');
    fadeEl.style.cssText = 'position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity 0.6s;z-index:40';
    document.body.appendChild(fadeEl);
  }
  if (instant) fadeEl.style.transition = 'none';
  fadeEl.style.opacity = on ? '1' : '0';
  if (instant) requestAnimationFrame(() => (fadeEl.style.transition = 'opacity 0.6s'));
}

// ---- sound --------------------------------------------------------------------------------------
const tmpV = new THREE.Vector3();
export function ambience(game, dt) {
  const p = game.player.ch;
  const w = game.world;
  const depth = w.depthAt(p.x, p.z);
  const under = clamp((depth - 4) / 14, 0, 1);
  // the cave breathes down here; the wind belongs to the surface
  audio.loop('cave', 'cave_loop', { bus: 'ambience', volume: 0 });
  audio.setLoopVolume('cave', 0.55 * under, 0.6);
  audio.setLoopVolume('wind', 0.4 * (1 - under), 0.6);
  // the river: louder the closer you are to it
  let rd = Infinity;
  const P = RIVER.pts;
  for (let i = 0; i < P.length - 1; i++) rd = Math.min(rd, distToSegment2(p.x, p.z, P[i][0], P[i][1] + 2.2, P[i + 1][0], P[i + 1][1] + 2.2));
  audio.loop('river', 'river_loop', { bus: 'ambience', volume: 0 });
  audio.setLoopVolume('river', 0.8 * clamp(1 - (rd - 4) / 36, 0, 1) * under, 0.4);
  // drips somewhere nearby in the dark
  game._ehDrip = (game._ehDrip ?? 2) - dt;
  if (game._ehDrip <= 0) {
    game._ehDrip = rand(0.8, 3.5);
    if (under > 0.5) {
      const a = Math.random() * Math.PI * 2;
      tmpV.set(p.x + Math.cos(a) * rand(3, 14), p.y + rand(1, 5), p.z + Math.sin(a) * rand(3, 14));
      audio.play3D('drip', tmpV, { bus: 'ambience', volume: rand(0.3, 0.7), refDistance: 4 });
    } else if (Math.random() < 0.3) {
      tmpV.set(p.x + rand(-30, 30), p.y + 10, p.z + rand(-30, 30));
      audio.play3D('creak', tmpV, { bus: 'ambience', volume: 0.4, refDistance: 15 });
    }
  }
}

// Circuits coming on: the pump starts humming, the reactor settles into its drone.
export function onPower(game, id) {
  const fx = game.world.fxPoints;
  if (id === 'mine' && fx.pump) audio.loop('pump', 'power_hum', { pos: new THREE.Vector3(fx.pump.x, fx.pump.y, fx.pump.z), bus: 'ambience', volume: 0.6, refDistance: 5 });
  if (id === 'reactor') audio.loop('reactorHum', 'reactor_hum', { pos: CORE.clone(), bus: 'ambience', volume: 0.8, refDistance: 22 });
}
