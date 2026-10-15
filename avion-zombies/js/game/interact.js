import * as THREE from '../../vendor/three.module.min.js';
import { WEAPONS, BOX_POOL, PERKS, UPGRADE_COSTS, weaponStats } from './weapons_data.js';
import { buildHologram, hologramMaterial, rbox } from './gunmodels.js';
import { std, basic } from '../world/materials.js';
import { boxGeometry } from '../world/builder.js';
import { makeSign } from '../world/textures.js';
import { perkIcon, skull, emblem, iconCanvas } from '../ui/icons.js';
import { audio } from '../engine/audio.js';
import { rand, clamp, pick } from '../util.js';

// Everything the player can buy or press: doors, wall-buys, Exo upgrades, the 3D printer
// (mystery box), the weapon forge (upgrade station), the power switch and the Exo armory.

function canvasTex(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function weighted(list) {
  const total = list.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [id, w] of list) {
    r -= w;
    if (r <= 0) return id;
  }
  return list[list.length - 1][0];
}

// Where a placed thing stands: an explicit floor (raised buildings), else the ground.
function baseY(game, d) {
  return d.floor ?? game.world.terrain.heightAt(d.x, d.z);
}

export class Interactable {
  constructor(game, pos, radius = 2.0) {
    this.game = game;
    this.pos = pos;
    this.radius = radius;
    this.facing = null; // optional facing vector; player must be in front
  }
  prompt() {
    return null;
  }
  use() {}
  update() {}
  reset() {}
}

class DoorI extends Interactable {
  constructor(game, door) {
    super(game, new THREE.Vector3(door.data.x, door.y + 1.4, door.data.z), Math.max(2.8, door.data.w * 0.6));
    this.door = door;
  }
  prompt() {
    if (this.door.open) return null;
    return { text: this.door.data.type === 'debris' ? this.door.data.label : 'Open ' + this.door.data.label, cost: this.door.data.cost };
  }
  use() {
    const g = this.game;
    if (!g.spend(this.door.data.cost)) return;
    g.openDoor(this.door);
  }
}

class WallBuy extends Interactable {
  constructor(game, data) {
    const y = baseY(game, data);
    super(game, new THREE.Vector3(data.x, y + data.y, data.z), 1.9);
    this.data = data;
    this.def = WEAPONS[data.weapon];
    this.facing = new THREE.Vector3(Math.sin(data.rot), 0, Math.cos(data.rot));
    const group = new THREE.Group();
    group.position.copy(this.pos);
    group.rotation.y = data.rot;
    const M = game.world.materials;
    const plate = new THREE.Mesh(boxGeometry(1.35, 0.62, 0.05, 1), M.steelDark);
    group.add(plate);
    const frameMat = basic({ color: new THREE.Color(5, 2.2, 0.6) });
    for (const [w, h, x, y2] of [[1.35, 0.025, 0, 0.3], [1.35, 0.025, 0, -0.3], [0.025, 0.62, -0.67, 0], [0.025, 0.62, 0.67, 0]]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), frameMat);
      m.position.set(x, y2, 0.03);
      group.add(m);
    }
    this.holoMat = hologramMaterial(0xffa050);
    const holo = buildHologram(this.def.model, this.holoMat);
    holo.group.rotation.y = Math.PI / 2;
    holo.group.scale.setScalar(Math.min(1.25, 1.0 / Math.max(0.3, holo.len)));
    holo.group.position.set(-holo.center * holo.group.scale.x, 0.02, 0.12);
    group.add(holo.group);
    const label = document.createElement('canvas');
    label.width = 256;
    label.height = 48;
    const lc = label.getContext('2d');
    lc.fillStyle = 'rgba(0,0,0,0)';
    lc.clearRect(0, 0, 256, 48);
    lc.font = '600 26px "Barlow Condensed", Arial, sans-serif';
    lc.fillStyle = '#ffd8a8';
    lc.textAlign = 'center';
    lc.fillText(this.def.name + '  •  ' + this.def.cost, 128, 32);
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.2), new THREE.MeshBasicMaterial({ map: canvasTex(label), transparent: true, color: new THREE.Color(1.6, 1.6, 1.6) }));
    lm.position.set(0, -0.2, 0.032);
    group.add(lm);
    game.mapRoot.add(group);
    this.group = group;
  }
  prompt() {
    const W = this.game.weapons;
    const owned = W.has(this.data.weapon);
    if (owned) {
      if (owned.reserve >= owned.stats.reserve) return { text: this.def.name + ' ammo full', cost: null, disabled: true };
      const cost = owned.level > 0 ? 4500 : this.def.ammoCost;
      return { text: 'Buy ammo for ' + owned.stats.name, cost };
    }
    return { text: 'Buy ' + this.def.name, cost: this.def.cost };
  }
  use() {
    const g = this.game;
    const W = g.weapons;
    const owned = W.has(this.data.weapon);
    if (owned) {
      if (owned.reserve >= owned.stats.reserve) return;
      const cost = owned.level > 0 ? 4500 : this.def.ammoCost;
      if (!g.spend(cost)) return;
      owned.reserve = owned.stats.reserve;
      audio.play('ammo_pickup', { volume: 0.8 });
      return;
    }
    if (!g.spend(this.def.cost)) return;
    W.give(this.data.weapon, 0);
  }
  update(dt, t) {
    this.holoMat.uniforms.uTime.value = t;
  }
}

class PerkMachine extends Interactable {
  constructor(game, data) {
    const y = baseY(game, data);
    super(game, new THREE.Vector3(data.x, y + 1.1, data.z), 2.0);
    this.data = data;
    this.def = PERKS[data.perk];
    this.facing = new THREE.Vector3(Math.sin(data.rot), 0, Math.cos(data.rot));
    const g = new THREE.Group();
    g.position.set(data.x, y, data.z);
    g.rotation.y = data.rot;
    const M = game.world.materials;
    const body = new THREE.Mesh(boxGeometry(0.95, 2.15, 0.75, 1), M.steelDark);
    body.position.y = 1.075;
    body.castShadow = true;
    g.add(body);
    const col = new THREE.Color(this.def.color);
    this.stripMat = basic({ color: col.clone().multiplyScalar(0.3) });
    for (const sx of [-0.43, 0.43]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.7, 0.04), this.stripMat);
      strip.position.set(sx, 1.05, 0.38);
      g.add(strip);
    }
    const icon = iconCanvas((ctx, s) => {
      ctx.fillStyle = '#0b0e10';
      ctx.fillRect(0, 0, s, s * 1.6);
      perkIcon(ctx, s, data.perk, this.def.color);
    }, 256);
    const sc = document.createElement('canvas');
    sc.width = 256;
    sc.height = 360;
    const c2 = sc.getContext('2d');
    c2.fillStyle = '#07090b';
    c2.fillRect(0, 0, 256, 360);
    c2.drawImage(icon, 20, 10, 216, 216);
    c2.fillStyle = this.def.color;
    c2.font = '700 40px "Barlow Condensed", Arial, sans-serif';
    c2.textAlign = 'center';
    c2.fillText(this.def.name, 128, 268);
    c2.font = '600 26px "Barlow Condensed", Arial, sans-serif';
    c2.fillStyle = '#c9c4b8';
    c2.fillText('AVION EXO UPGRADE', 128, 306);
    c2.fillText(this.def.cost + ' PTS', 128, 340);
    this.screenMat = new THREE.MeshBasicMaterial({ map: canvasTex(sc), color: new THREE.Color(0.08, 0.08, 0.08) });
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.0), this.screenMat);
    screen.position.set(0, 1.45, 0.381);
    g.add(screen);
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.1), M.black);
    slot.position.set(0, 0.62, 0.38);
    g.add(slot);
    game.mapRoot.add(g);
    this.group = g;
    this.col = col;
    this.collider = game.world.physics.addBox({ x: data.x, y, z: data.z, w: 0.95, h: 2.15, d: 0.75, rot: data.rot, walkable: false, material: 'metal' });
    this.jingleT = rand(10, 40);
    this.uses = 0;
  }
  powered() {
    return this.def.noPower || this.game.world.powered(this.data.circuit);
  }
  prompt() {
    const g = this.game;
    const p = g.player;
    if (p.perks.has(this.data.perk)) return { text: this.def.name + ' installed', cost: null, disabled: true };
    if (this.data.perk === 'medic' && this.uses >= 3) return { text: 'Exo Medic depleted', cost: null, disabled: true };
    if (!this.powered()) return { text: 'Requires power', cost: null, disabled: true };
    if (!p.exo.has) return { text: 'Requires an Avion Exo Suit', cost: null, disabled: true };
    return { text: 'Install ' + this.def.name, cost: this.def.cost, sub: this.def.desc };
  }
  use() {
    const g = this.game;
    const p = g.player;
    if (p.perks.has(this.data.perk) || !this.powered() || !p.exo.has) return;
    if (this.data.perk === 'medic' && this.uses >= 3) return;
    if (!g.spend(this.def.cost)) return;
    if (this.data.perk === 'medic') this.uses++;
    g.givePerk(this.data.perk);
    audio.play3D(this.def.jingle, this.pos, { volume: 0.9, refDistance: 5 });
  }
  update(dt, t) {
    const on = this.powered();
    const k = on ? 1.5 + Math.sin(t * 2 + this.pos.x) * 0.2 : Math.random() < 0.02 ? 0.4 : 0.06;
    this.stripMat.color.copy(this.col).multiplyScalar(k * 3);
    this.screenMat.color.setScalar(on ? 1.3 : 0.12);
    if (on) {
      this.jingleT -= dt;
      if (this.jingleT <= 0) {
        this.jingleT = rand(40, 80);
        const pp = this.game.player.pos;
        if (pp.distanceTo(this.pos) < 12) audio.play3D(this.def.jingle, this.pos, { volume: 0.55, refDistance: 3 });
      }
    }
  }
}

class ExoStation extends Interactable {
  constructor(game, data) {
    const y = baseY(game, data);
    super(game, new THREE.Vector3(data.x, y + 1.2, data.z), 2.2);
    this.data = data;
    const g = new THREE.Group();
    g.position.set(data.x, y, data.z);
    g.rotation.y = data.rot;
    const M = game.world.materials;
    const metal = new THREE.MeshStandardMaterial({ color: 0x5d656d, metalness: 0.8, roughness: 0.35 });
    this.glow = basic({ color: new THREE.Color(0.6, 2.6, 5) });
    const rack = new THREE.Mesh(boxGeometry(1.4, 2.3, 0.2, 1), M.steelDark);
    rack.position.set(0, 1.15, -0.25);
    g.add(rack);
    // hanging exo suit: power pack, spine, yoke, hip belt, jointed leg and arm struts
    const dark = new THREE.MeshStandardMaterial({ color: 0x24272b, metalness: 0.2, roughness: 0.7 });
    this.suit = new THREE.Group();
    const part = (geo, mat, x, yy, z, rx = 0, rz = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, yy, z);
      m.rotation.set(rx, 0, rz);
      m.castShadow = true;
      this.suit.add(m);
      return m;
    };
    part(rbox(0.34, 0.42, 0.12, 0.03), metal, 0, 1.42, -0.07);
    part(rbox(0.07, 0.5, 0.06, 0.02), metal, 0, 1.25, 0.0);
    part(rbox(0.52, 0.07, 0.16, 0.025), metal, 0, 1.68, 0.0);
    part(rbox(0.44, 0.09, 0.2, 0.03), dark, 0, 1.0, 0.0);
    for (const sx of [-1, 1]) {
      part(rbox(0.07, 0.42, 0.07, 0.02), metal, sx * 0.13, 0.76, 0.02);
      part(new THREE.CylinderGeometry(0.045, 0.045, 0.09, 14), dark, sx * 0.13, 0.54, 0.03, 0, Math.PI / 2);
      part(rbox(0.055, 0.42, 0.055, 0.018), metal, sx * 0.13, 0.3, 0.03);
      part(rbox(0.11, 0.035, 0.22, 0.012), dark, sx * 0.13, 0.05, 0.07);
      part(rbox(0.055, 0.3, 0.055, 0.018), metal, sx * 0.31, 1.5, 0.02, 0, sx * 0.08);
      part(new THREE.CylinderGeometry(0.035, 0.035, 0.07, 12), dark, sx * 0.33, 1.33, 0.03, 0, Math.PI / 2);
      part(rbox(0.06, 0.26, 0.07, 0.02), metal, sx * 0.34, 1.18, 0.07, -0.25);
      part(new THREE.BoxGeometry(0.012, 0.3, 0.012), this.glow, sx * 0.13, 0.76, 0.06);
      part(new THREE.BoxGeometry(0.014, 0.28, 0.014), this.glow, sx * 0.09, 1.42, -0.0);
    }
    g.add(this.suit);
    game.mapRoot.add(g);
    this.group = g;
    game.world.physics.addBox({ x: data.x, y, z: data.z, w: 1.4, h: 2.3, d: 0.7, rot: data.rot, walkable: false, material: 'metal' });
  }
  prompt() {
    if (this.game.player.exo.has) return null;
    return { text: 'Equip the Avion Exo Suit', cost: 0, sub: 'Boost jump, boost dodge, exo slam.' };
  }
  use() {
    if (this.game.player.exo.has) return;
    this.game.equipExo();
    this.suit.visible = false;
  }
  update(dt, t) {
    this.glow.color.setRGB(0.6, 2.6, 5).multiplyScalar(0.7 + Math.sin(t * 3) * 0.3);
  }
  reset() {
    this.suit.visible = true;
  }
}

class PowerSwitch extends Interactable {
  constructor(game, data) {
    const y = baseY(game, data);
    super(game, new THREE.Vector3(data.x, y + 1.4, data.z), 2.2);
    this.data = data;
    const g = new THREE.Group();
    g.position.set(data.x, y, data.z);
    g.rotation.y = data.rot;
    const M = game.world.materials;
    this.lamp = basic({ color: new THREE.Color(5, 0.4, 0.2) });
    const lampM = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), this.lamp);
    this.lever = new THREE.Group();
    if (data.style === 'breaker') {
      // a wall-mounted breaker cabinet with a big throw handle on its side
      this.facing = new THREE.Vector3(Math.sin(data.rot), 0, Math.cos(data.rot));
      this.radius = 1.9;
      this.pos.y = y + 1.4;
      const cab = new THREE.Mesh(boxGeometry(0.72, 1.05, 0.28, 1), M.steelDark);
      cab.position.set(0, 1.45, 0.14);
      g.add(cab);
      const door = new THREE.Mesh(boxGeometry(0.64, 0.95, 0.03, 1), M.steel);
      door.position.set(0, 1.45, 0.295);
      g.add(door);
      const conduit = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), M.steelDark);
      conduit.position.set(-0.22, 2.65, 0.08);
      g.add(conduit);
      this.lever.position.set(0.42, 1.45, 0.16);
      const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 10), M.black);
      pivot.rotation.z = Math.PI / 2;
      this.lever.add(pivot);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.42, 0.05), M.steel);
      arm.position.set(0.03, 0.21, 0);
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.14, 0.07), M.redPaint);
      knob.position.set(0.03, 0.44, 0);
      this.lever.add(arm, knob);
      g.add(this.lever);
      lampM.position.set(0.22, 1.86, 0.31);
      g.add(lampM);
      const [l1, l2] = data.sign || ['BREAKER', 'PANEL'];
      const sign = makeSign([{ text: l1, size: 44 }, { text: l2, size: 30, weight: 600 }], { w: 256, h: 112, bg: '#e7e2d4', fg: '#22262a', stripe: false });
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.22), std({ map: sign, roughness: 0.6 }));
      sm.position.set(0, 1.62, 0.312);
      g.add(sm);
      const hz = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.06), M.hazard);
      hz.position.set(0, 1.08, 0.312);
      g.add(hz);
      this.leverFrom = -0.95;
      this.leverTo = 0.95;
    } else {
      const panel = new THREE.Mesh(boxGeometry(1.6, 2.2, 0.35, 1), M.steelDark);
      panel.position.y = 1.4;
      g.add(panel);
      const hz = new THREE.Mesh(boxGeometry(1.6, 0.2, 0.36, 1), M.hazard);
      hz.position.y = 0.4;
      g.add(hz);
      this.lever.position.set(0, 1.5, 0.2);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), M.steel);
      arm.position.y = 0.3;
      const knob = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), M.redPaint);
      knob.position.y = 0.6;
      this.lever.add(arm, knob);
      g.add(this.lever);
      lampM.position.set(0.55, 2.25, 0.2);
      g.add(lampM);
      const sign = makeSign([{ text: 'MAIN POWER', size: 70 }, { text: 'REACTOR BUS A', size: 32, weight: 600 }], { w: 256, h: 128 });
      const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), std({ map: sign, roughness: 0.7 }));
      sm.position.set(0, 2.15, 0.18);
      g.add(sm);
      this.leverFrom = -0.5;
      this.leverTo = 1.1;
    }
    this.lever.rotation.x = this.leverFrom;
    game.mapRoot.add(g);
    this.group = g;
    this.anim = 0;
  }
  get on() {
    return this.game.world.powered(this.data.circuit);
  }
  prompt() {
    if (this.on) return null;
    return { text: this.data.prompt || 'Restore facility power', cost: 0, sub: this.data.sub };
  }
  use() {
    if (this.on) return;
    this.anim = 0.001;
    if (this.data.circuit) this.game.turnOnCircuit(this.data.circuit);
    else this.game.turnOnPower();
  }
  update(dt) {
    if (this.anim > 0 && this.anim < 1) {
      this.anim = Math.min(1, this.anim + dt * 2.2);
      this.lever.rotation.x = this.leverFrom + (this.leverTo - this.leverFrom) * this.anim;
    } else if (this.on && this.anim === 0) {
      // powered some other way (free roam): show the lever thrown
      this.anim = 1;
      this.lever.rotation.x = this.leverTo;
    }
    this.lamp.color.setRGB(this.on ? 0.4 : 5, this.on ? 5 : 0.4, 0.3);
  }
  reset() {
    this.anim = 0;
    this.lever.rotation.x = this.leverFrom;
  }
}

// ---- 3D printer (mystery box) -------------------------------------------------------------
class Printer extends Interactable {
  constructor(game, locations, startIndex) {
    super(game, new THREE.Vector3(), 2.1);
    this.locations = locations;
    this.loc = startIndex;
    const M = game.world.materials;
    const g = new THREE.Group();
    const base = new THREE.Mesh(boxGeometry(1.7, 0.9, 0.95, 1), M.steelDark);
    base.position.y = 0.45;
    base.castShadow = true;
    g.add(base);
    const top = new THREE.Mesh(boxGeometry(1.7, 0.12, 0.95, 1), M.steel);
    top.position.y = 1.62;
    g.add(top);
    for (const [x, z] of [[-0.82, -0.44], [0.82, -0.44], [-0.82, 0.44], [0.82, 0.44]]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.06), M.steel);
      post.position.set(x, 1.26, z);
      g.add(post);
    }
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 0.88), M.glass);
    glass.position.y = 1.25;
    g.add(glass);
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.16), M.olive);
    this.head.position.set(0, 1.5, 0);
    g.add(this.head);
    this.lightMat = basic({ color: new THREE.Color(5, 2.4, 0.8) });
    const strip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 0.02), this.lightMat);
    strip.position.set(0, 0.86, 0.48);
    g.add(strip);
    const ec = iconCanvas((ctx, s) => emblem(ctx, s, '#e8e2d2'), 128);
    const em = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: canvasTex(ec), transparent: true, color: new THREE.Color(1.2, 1.2, 1.2) }));
    em.position.set(0, 0.45, 0.48);
    g.add(em);
    const label = makeSign([{ text: 'AVION FABRICATOR', size: 52 }, { text: '950 PTS • RANDOM ARMAMENT', size: 28, weight: 600 }], { w: 256, h: 96, stripe: false, bg: '#14181b' });
    const lm = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.36), new THREE.MeshBasicMaterial({ map: label, color: new THREE.Color(1.3, 1.3, 1.3) }));
    lm.position.set(0, 0.2, 0.481);
    g.add(lm);
    // beacon of light so you can find it from across the map
    const beamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.9, 0.35), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 60, 12, 1, true), beamMat);
    this.beam.position.y = 31;
    g.add(this.beam);
    this.holoMat = hologramMaterial(0xffb060);
    this.holoSlot = new THREE.Group();
    this.holoSlot.position.set(0, 1.25, 0);
    g.add(this.holoSlot);
    this.holos = new Map();
    const sk = iconCanvas((ctx, s) => skull(ctx, s, '#ff4a3a'), 256);
    this.skull = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: canvasTex(sk), transparent: true, color: new THREE.Color(3, 3, 3), side: THREE.DoubleSide, depthWrite: false }));
    this.skull.visible = false;
    this.holoSlot.add(this.skull);
    game.mapRoot.add(g);
    this.group = g;
    this.collider = null;
    this.state = 'idle';
    this.t = 0;
    this.usesHere = 0;
    this.place(this.loc);
  }
  holo(id) {
    if (id === 'lure') id = 'smg';
    const model = WEAPONS[id] ? WEAPONS[id].model : id;
    let h = this.holos.get(model);
    if (!h) {
      h = buildHologram(model, this.holoMat);
      h.group.rotation.y = Math.PI / 2;
      h.group.scale.setScalar(Math.min(1.4, 1.0 / Math.max(0.3, h.len)));
      h.group.position.x = -h.center * h.group.scale.x;
      this.holos.set(model, h);
      this.holoSlot.add(h.group);
    }
    return h;
  }
  showHolo(id) {
    for (const h of this.holos.values()) h.group.visible = false;
    this.skull.visible = false;
    if (id === 'skull') this.skull.visible = true;
    else if (id) this.holo(id).group.visible = true;
  }
  place(i) {
    const L = this.locations[i];
    const y = baseY(this.game, L);
    // the locator beam stops at a roof or a cave ceiling
    const beamH = L.beam ?? 60;
    this.beam.visible = beamH > 0;
    this.beam.scale.y = Math.max(0.01, beamH / 60);
    this.beam.position.y = 1.6 + beamH / 2;
    this.group.position.set(L.x, y, L.z);
    this.group.rotation.y = L.rot;
    this.pos.set(L.x, y + 1.2, L.z);
    this.facing = new THREE.Vector3(Math.sin(L.rot), 0, Math.cos(L.rot));
    if (this.collider) this.collider.disabled = true;
    this.collider = this.game.world.physics.addBox({ x: L.x, y, z: L.z, w: 1.7, h: 1.7, d: 0.95, rot: L.rot, walkable: true, material: 'metal' });
    this.group.visible = true;
    this.usesHere = 0;
    this.loc = i;
  }
  cost() {
    return this.game.powerups.active('firesale') ? 10 : 950;
  }
  get powered() {
    const c = this.locations[this.loc].circuit;
    return !c || this.game.world.powered(c);
  }
  prompt() {
    if (this.state === 'idle' && !this.powered) return { text: 'Fabricator offline: no power', cost: null, disabled: true };
    if (this.state === 'idle') return { text: 'Fabricate a random weapon', cost: this.cost() };
    if (this.state === 'ready') {
      const name = this.result === 'lure' ? 'LURE DRONES' : WEAPONS[this.result].name;
      return { text: 'Take ' + name, cost: null };
    }
    return null;
  }
  use() {
    const g = this.game;
    if (this.state === 'idle') {
      if (!this.powered) return;
      if (!g.spend(this.cost())) return;
      this.state = 'printing';
      this.t = 0;
      this.usesHere++;
      this.paid = this.cost();
      const malf = this.usesHere >= 4 && Math.random() < 0.22;
      const owned = new Set(g.weapons.inv.map((w) => w.id));
      const pool = BOX_POOL.filter(([id]) => !owned.has(id));
      this.result = malf ? 'skull' : weighted(pool.length ? pool : BOX_POOL);
      audio.play3D('box_open', this.pos, { volume: 1, refDistance: 4 });
      audio.play3D('box_spin', this.pos, { volume: 0.9, refDistance: 4 });
      this.cycleT = 0;
    } else if (this.state === 'ready') {
      this.state = 'idle';
      this.showHolo(null);
      g.weapons.give(this.result, 0);
      audio.play('mag_pouch', { volume: 0.6 });
    }
  }
  update(dt, t) {
    this.holoMat.uniforms.uTime.value = t;
    this.holoSlot.rotation.y += dt * (this.state === 'ready' ? 0.8 : 0);
    this.beam.material.opacity = 0.18 + Math.sin(t * 1.3) * 0.06;
    if (this.state === 'printing') {
      this.t += dt;
      // cycle holograms, slowing down
      this.cycleT -= dt;
      if (this.cycleT <= 0) {
        this.cycleT = 0.07 + this.t * 0.045;
        const [id] = pick(BOX_POOL);
        this.showHolo(id);
      }
      this.head.position.x = Math.sin(this.t * 9) * 0.6;
      this.head.position.z = Math.cos(this.t * 7) * 0.3;
      this.lightMat.color.setRGB(5, 2.4 + Math.sin(this.t * 30) * 1.5, 0.8);
      if (Math.random() < 0.4) this.game.particles.sparks(this.group.position.x + this.head.position.x, this.group.position.y + 1.44, this.group.position.z, 0, -1, 0, 1, [0.6, 0.8, 1]);
      if (this.t >= 4.4) {
        if (this.result === 'skull') {
          this.state = 'malfunction';
          this.t = 0;
          this.showHolo('skull');
          audio.play3D('box_glitch', this.pos, { volume: 1, refDistance: 5 });
          audio.zombie('laugh', this.pos, { volume: 1.2, force: true });
          this.game.hud.message('FABRICATOR MALFUNCTION', 'Relocating unit…', 3);
        } else {
          this.state = 'ready';
          this.t = 0;
          this.showHolo(this.result);
          audio.play3D('box_ready', this.pos, { volume: 0.8, refDistance: 4 });
        }
      }
    } else if (this.state === 'ready') {
      this.t += dt;
      this.head.position.set(0, 1.5, 0);
      if (this.t > 11) {
        this.state = 'idle';
        this.showHolo(null);
      }
    } else if (this.state === 'malfunction') {
      this.t += dt;
      this.skull.position.y = this.t * 0.6;
      this.skull.rotation.y += dt * 6;
      this.group.visible = this.t < 2.4 || Math.random() < 0.5;
      if (this.t > 3.2) {
        this.skull.position.y = 0;
        this.showHolo(null);
        this.game.addPoints(this.paid, true, true);
        const others = this.locations.map((_, i) => i).filter((i) => i !== this.loc);
        this.place(pick(others));
        this.state = 'idle';
        audio.play3D('power_on', this.pos, { volume: 0.4, refDistance: 6 });
      }
    } else {
      this.head.position.set(Math.sin(t * 0.5) * 0.05, 1.5, 0);
      this.lightMat.color.setRGB(5, 2.4, 0.8);
    }
  }
  reset(startIndex) {
    this.state = 'idle';
    this.showHolo(null);
    this.place(startIndex);
  }
}

// ---- Weapon forge (upgrade station / pack-a-punch) ------------------------------------------
class Forge extends Interactable {
  constructor(game, data) {
    const y = baseY(game, data);
    super(game, new THREE.Vector3(data.x, y + 1.2, data.z), 2.4);
    this.data = data;
    this.facing = new THREE.Vector3(Math.sin(data.rot), 0, Math.cos(data.rot));
    const M = game.world.materials;
    const g = new THREE.Group();
    g.position.set(data.x, y, data.z);
    g.rotation.y = data.rot;
    const body = new THREE.Mesh(boxGeometry(2.6, 2.6, 1.5, 1), M.steelDark);
    body.position.set(0, 1.3, -0.2);
    body.castShadow = true;
    g.add(body);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.3), M.black);
    mouth.position.set(0, 1.15, 0.5);
    g.add(mouth);
    this.coreMat = basic({ color: new THREE.Color(0.3, 0.1, 0.3) });
    const core = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 0.05), this.coreMat);
    core.position.set(0, 1.15, 0.66);
    g.add(core);
    this.rings = [];
    for (let k = 0; k < 3; k++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.55 - k * 0.12, 0.035, 8, 32), this.coreMat);
      r.position.set(0, 2.15, 0.56);
      g.add(r);
      this.rings.push(r);
    }
    const sign = makeSign([{ text: 'WEAPON FORGE', size: 64 }, { text: 'AVION ADVANCED ARMAMENTS', size: 28, weight: 600 }], { w: 256, h: 112 });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.66), std({ map: sign, roughness: 0.7 }));
    sm.position.set(0, 0.45, 0.56);
    g.add(sm);
    this.holoMat = hologramMaterial(0xff6ad0);
    this.slot = new THREE.Group();
    this.slot.position.set(0, 1.15, 0.85);
    g.add(this.slot);
    game.mapRoot.add(g);
    this.group = g;
    game.world.physics.addBox({ x: data.x, y, z: data.z - 0.2, w: 2.6, h: 2.6, d: 1.5, rot: data.rot, walkable: false, material: 'metal' });
    this.state = 'idle';
    this.t = 0;
  }
  prompt() {
    const g = this.game;
    if (!g.world.powered(this.data.circuit)) return { text: 'Requires power', cost: null, disabled: true };
    if (this.state === 'ready') return { text: 'Take ' + weaponStats(this.item.id, this.item.level + 1).name, cost: null };
    if (this.state !== 'idle') return null;
    const c = g.weapons.cur;
    if (!c) return null;
    if (WEAPONS[c.id].wonder && c.level >= 1) return { text: c.stats.name + ' is at maximum power', cost: null, disabled: true };
    if (c.level >= 3) return { text: c.stats.name + ' is fully upgraded', cost: null, disabled: true };
    return { text: 'Upgrade ' + c.stats.name + ' (Lv ' + (c.level + 1) + ')', cost: UPGRADE_COSTS[c.level] };
  }
  use() {
    const g = this.game;
    if (!g.world.powered(this.data.circuit)) return;
    if (this.state === 'ready') {
      g.weapons.give(this.item.id, this.item.level + 1);
      this.clearSlot();
      this.state = 'idle';
      return;
    }
    if (this.state !== 'idle') return;
    const W = g.weapons;
    const c = W.cur;
    if (!c || c.level >= 3 || (WEAPONS[c.id].wonder && c.level >= 1)) return;
    if (!g.spend(UPGRADE_COSTS[c.level])) return;
    this.item = { id: c.id, level: c.level };
    // the forge takes the gun
    W.inv.splice(W.index, 1);
    if (W.inv.length) W.switchTo(0);
    else {
      W.index = 0;
      g.viewmodel.setWeapon(null);
    }
    this.state = 'forging';
    this.t = 0;
    audio.play3D('upgrade', this.pos, { volume: 1, refDistance: 5 });
    this.clearSlot();
    const h = buildHologram(WEAPONS[c.id].model, this.holoMat);
    h.group.rotation.y = Math.PI / 2;
    h.group.position.x = -h.center;
    this.slot.add(h.group);
    this.holo = h;
  }
  clearSlot() {
    if (this.holo) this.slot.remove(this.holo.group);
    this.holo = null;
  }
  update(dt, t) {
    this.holoMat.uniforms.uTime.value = t;
    const on = this.game.world.powered(this.data.circuit);
    const base = on ? 1.2 : 0.08;
    let k = base;
    if (this.state === 'forging') {
      this.t += dt;
      k = 2 + Math.sin(this.t * 25) * 1.5 + this.t;
      this.slot.position.z = 0.85 - Math.min(1, this.t / 0.6) * 0.5 + Math.max(0, (this.t - 2.9) / 0.6) * 0.5;
      this.holoMat.uniforms.uOpacity.value = this.t < 0.6 ? 1 : this.t > 2.9 ? 1 : 0.15;
      if (Math.random() < 0.5) this.game.particles.sparks(this.group.position.x, this.group.position.y + 1.2, this.group.position.z + 0.6, 0, 0.3, 1, 2, [1, 0.4, 0.9]);
      if (this.t > 3.5) {
        this.state = 'ready';
        this.t = 0;
        this.holoMat.uniforms.uOpacity.value = 1;
        this.slot.position.z = 0.85;
      }
    } else if (this.state === 'ready') {
      this.t += dt;
      this.slot.rotation.y = Math.sin(t * 2) * 0.3;
      if (this.t > 14) {
        // unclaimed weapons are returned to the player rather than lost
        this.game.weapons.give(this.item.id, this.item.level + 1);
        this.clearSlot();
        this.state = 'idle';
      }
    }
    this.coreMat.color.setRGB(1.6 * k, 0.4 * k, 1.4 * k);
    for (let i = 0; i < this.rings.length; i++) this.rings[i].rotation.z += dt * (on ? 1 + i : 0.1) * (this.state === 'forging' ? 6 : 1);
  }
  reset() {
    this.state = 'idle';
    this.clearSlot();
  }
}

export class Interactables {
  constructor(game) {
    this.game = game;
    const map = game.map;
    this.list = [];
    for (const d of game.world.doors) this.list.push(new DoorI(game, d));
    for (const w of map.WALLBUYS) this.list.push(new WallBuy(game, w));
    for (const p of map.PERKS) this.list.push(new PerkMachine(game, p));
    this.exo = new ExoStation(game, map.EXO_STATION);
    this.list.push(this.exo);
    this.switches = (map.POWER_SWITCHES || [map.POWER_SWITCH]).map((d) => new PowerSwitch(game, d));
    this.power = this.switches[0];
    this.list.push(...this.switches);
    this.printer = new Printer(game, map.BOX_LOCATIONS, map.BOX_START);
    this.list.push(this.printer);
    this.forge = new Forge(game, map.UPGRADE_STATION);
    this.list.push(this.forge);
    if (game.daybreak) for (const i of game.daybreak.interactables) this.list.push(i);
    if (map.interactables) for (const i of map.interactables(game, Interactable)) this.list.push(i);
    this.current = null;
    this.prompt = null;
    this.time = 0;
  }

  reset() {
    for (const i of this.list) {
      if (i === this.printer) i.reset(this.game.map.BOX_START);
      else i.reset();
    }
    for (const i of this.list) if (i instanceof PerkMachine) i.uses = 0;
  }

  update(dt, input) {
    this.time += dt;
    const t = this.time;
    for (const i of this.list) i.update(dt, t);
    const p = this.game.player;
    if (p.downed || p.dead) {
      this.current = null;
      this.prompt = null;
      return;
    }
    const eye = p.eye;
    let best = null;
    let bestScore = Infinity;
    for (const i of this.list) {
      const dx = i.pos.x - eye.x;
      const dy = i.pos.y - eye.y;
      const dz = i.pos.z - eye.z;
      const d = Math.hypot(dx, dz);
      if (d > i.radius || Math.abs(dy) > 2.2) continue;
      if (i.facing && d > 0.6) {
        // must be standing in front of wall-mounted things
        if (-(dx * i.facing.x + dz * i.facing.z) / d < 0.2) continue;
      }
      const look = (dx * p.forward.x + dy * p.forward.y + dz * p.forward.z) / Math.max(0.01, Math.hypot(dx, dy, dz));
      if (look < -0.1 && d > 1.2) continue;
      const pr = i.prompt();
      if (!pr) continue;
      const score = d - look * 1.5;
      if (score < bestScore) {
        bestScore = score;
        best = { i, pr };
      }
    }
    this.current = best ? best.i : null;
    this.prompt = best ? best.pr : null;
    const pressed = input.pressed.interact || (input.lastDevice === 'pad' && input.pressed.use);
    if (best && pressed && !best.pr.disabled) best.i.use();
    else if (input.pressed.use && !best) this.game.weapons.startReload();
  }
}
