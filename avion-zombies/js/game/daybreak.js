import * as THREE from '../../vendor/three.module.min.js';
import { Interactable } from './interact.js';
import { glowSprite } from './boss.js';
import { rbox } from './gunmodels.js';
import { PERKS } from './weapons_data.js';
import { std } from '../world/materials.js';
import { boxGeometry } from '../world/builder.js';
import { makeSign } from '../world/textures.js';
import { audio } from '../engine/audio.js';
import { clamp, lerp, rand, smoothstep, formatTime } from '../util.js';
import { loadRecords, saveRecords } from '../settings.js';

// PROJECT DAYBREAK: an Avion solar-displacement array that can turn night into day.
// Easter egg: recover 3 focusing prisms, install them, power up, shoot the 3 heliostat
// mirrors into line and activate it. The light wakes the Nightwarden; the array's
// daylight is the only thing that breaks its shield.
const CHARGE_FIRST = 24; // seconds of night before the first daylight
const CHARGE_TIME = 30;
const DAY_TIME = 24;
const GOLD = new THREE.Color(3.2, 2.0, 0.7);

const RADIO = [
  'Dr. Ilse Voss, Project Daybreak. If anyone on site can hear this, listen carefully.',
  'Subject Zero is loose. We call it the Nightwarden. In the dark its shield shrugs off everything.',
  'But daylight burns it. The Daybreak array on the Hangar Yard helipad can turn night into day.',
  'I hid its three focusing prisms: in the Ranger Station cabin, in the Research Wing east lab, and at the Radio Tower.',
  'Install them, shoot the three heliostat mirrors to aim them at the array, then bring the sun up. Good luck.',
];

function crystalGeometry() {
  const g = new THREE.OctahedronGeometry(0.12, 0);
  g.scale(1, 1.7, 1);
  return g;
}

class PrismPickup extends Interactable {
  constructor(db, data) {
    const game = db.game;
    const ground = game.world.terrain.heightAt(data.x, data.z);
    const y = data.y != null ? data.y : ground + (data.top || 0);
    super(game, new THREE.Vector3(data.x, y + 0.25, data.z), 1.9);
    this.db = db;
    this.data = data;
    const g = new THREE.Group();
    g.position.set(data.x, y, data.z);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.19, 0.07, 6), db.mats.dark);
    base.position.y = 0.035;
    g.add(base);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const prong = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.025), db.mats.metal);
      prong.position.set(Math.cos(a) * 0.12, 0.12, Math.sin(a) * 0.12);
      prong.rotation.set(Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3);
      g.add(prong);
    }
    this.crystal = new THREE.Mesh(crystalGeometry(), db.mats.crystal);
    this.crystal.position.y = 0.3;
    g.add(this.crystal);
    this.glow = glowSprite(GOLD.clone().multiplyScalar(0.35), 0.75);
    this.glow.position.y = 0.3;
    g.add(this.glow);
    // faint shaft of light so it can be spotted from a distance (it fades as you walk up to it)
    this.shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.22, 9, 12, 1, true), db.mats.shaft.clone());
    this.shaft.position.y = 4.8;
    g.add(this.shaft);
    game.scene.add(g);
    this.group = g;
  }

  prompt() {
    if (this.db.found.has(this.data.id)) return null;
    return { text: 'Take the Daybreak prism', cost: 0, sub: 'A focusing crystal for the Daybreak array on the yard helipad' };
  }

  use() {
    this.db.takePrism(this);
  }

  update(dt, t) {
    const taken = this.db.found.has(this.data.id);
    this.group.visible = !taken;
    if (taken) return;
    this.crystal.rotation.y = t * 1.3;
    this.crystal.position.y = 0.3 + Math.sin(t * 2 + this.pos.x) * 0.03;
    const d = this.game.player.pos.distanceTo(this.pos);
    const near = clamp((d - 1.5) / 6, 0, 1);
    this.glow.material.opacity = (0.75 + Math.sin(t * 3.1 + this.pos.z) * 0.25) * (0.35 + 0.65 * near);
    this.shaft.material.opacity = 0.15 + 0.85 * near;
    // hum when close
    const key = 'prism_' + this.data.id;
    if (d < 11 && this.game.inMatch) audio.loop(key, 'prism_hum', { pos: this.pos, volume: 0.45, refDistance: 2 });
    else audio.stopLoop(key, 0.4);
  }
}

class ArrayConsole extends Interactable {
  constructor(db, pos) {
    super(db.game, pos, 2.6);
    this.db = db;
  }

  prompt() {
    return this.db.consolePrompt();
  }

  use() {
    this.db.useConsole();
  }
}

export class Daybreak {
  constructor(game) {
    this.game = game;
    this.cfg = game.map.DAYBREAK;
    this.mats = {
      dark: std({ color: 0x1b1d21, metalness: 0.5, roughness: 0.5 }),
      metal: std({ color: 0x9aa2aa, metalness: 0.75, roughness: 0.3 }),
      steel: std({ color: 0x6d747c, metalness: 0.6, roughness: 0.38 }),
      crystal: std({ color: 0xffd27a, emissive: 0xffa53a, emissiveIntensity: 2.4, metalness: 0.1, roughness: 0.15 }),
      mirror: std({ color: 0xe6edf4, metalness: 1.0, roughness: 0.05 }),
      shaft: new THREE.MeshBasicMaterial({ color: GOLD.clone().multiplyScalar(0.09), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
      trim: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.2, 0.05) }),
    };
    this._buildMachine();
    this._buildMirrors();
    this.prisms = this.cfg.prisms.map((p) => new PrismPickup(this, p));
    this.console = new ArrayConsole(this, new THREE.Vector3(this.cfg.console.x, this.gy + 1.2, this.cfg.console.z));
    this.interactables = [...this.prisms, this.console];
    this._refreshNav();
    this.reset();
  }

  // The array went in after the nav grid was baked: re-rasterise the cells it covers so the
  // horde walks around the plinth, console and mirror posts instead of into them.
  _refreshNav() {
    const w = this.game.world;
    const nav = w.nav;
    const tmp = [];
    const spots = [[this.cfg.machine.x, this.cfg.machine.z, 4.2], [this.cfg.console.x, this.cfg.console.z, 1.6], ...this.cfg.mirrors.map((m) => [m.x, m.z, 1.4])];
    for (const [x, z, r] of spots) {
      for (let dx = -r; dx <= r; dx += nav.cell) {
        for (let dz = -r; dz <= r; dz += nav.cell) {
          const i = nav.idx(x + dx, z + dz);
          if (i >= 0) nav._rasterCell(i, w.physics, w.terrain, 0.32, tmp);
        }
      }
    }
  }

  reset() {
    this.found = new Set();
    this.held = 0;
    this.installed = 0;
    this.activated = false;
    this.discovered = false;
    this.transmission = null;
    this.radioAt = null;
    this.phase = 'idle'; // idle -> intro -> charging -> ready -> day -> ... -> victory
    this.t = 0;
    this.charge = 0;
    this.done = false;
    this.cycles = 0;
    this.doneShowT = 0;
    this.warnT = 0;
    this.fightTime = 0;
    for (const m of this.mirrors) {
      m.aligned = false;
      m.anim = 0;
      m.pivot.quaternion.copy(m.offQ);
      m.lampMat.color.setRGB(4, 0.3, 0.2);
      m.beam.visible = false;
    }
    for (const s of this.sockets) s.crystal.visible = false;
    this.pillar.visible = false;
    this.groundGlow.visible = false;
    for (const p of this.cfg.prisms) audio.stopLoop('prism_' + p.id, 0.1);
    audio.stopLoop('daybreakHum', 0.1);
    audio.stopLoop('bossMusic', 0.1);
    this.game.boss && this.game.boss.reset();
    if (this.game.world) this.game.world.sky.clearOverrides();
    this.screenText = '';
    this._drawScreen();
  }

  // ---- model --------------------------------------------------------------------------------------
  _buildMachine() {
    const game = this.game;
    const M = game.world.materials;
    const { x, z } = this.cfg.machine;
    const gy = game.world.physics.groundHeight(x, z, 0.5, 100);
    this.gy = gy;
    const g = new THREE.Group();
    g.position.set(x, gy, z);
    this.group = g;
    const add = (geo, mat, px, py, pz, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(px, py, pz);
      m.castShadow = cast;
      m.receiveShadow = true;
      g.add(m);
      return m;
    };
    // octagonal plinth with a hazard band
    add(new THREE.CylinderGeometry(2.75, 3.0, 0.6, 8), M.steelDark, 0, 0.3, 0);
    const band = add(new THREE.CylinderGeometry(2.77, 2.77, 0.14, 8, 1, true), M.hazard, 0, 0.53, 0, false);
    band.rotation.y = 0;
    add(new THREE.CylinderGeometry(1.25, 1.4, 0.3, 16), this.mats.steel, 0, 0.75, 0);
    // column with conduits and glowing seams
    add(new THREE.CylinderGeometry(0.42, 0.58, 3.6, 14), this.mats.steel, 0, 2.6, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const cd = add(new THREE.BoxGeometry(0.11, 3.3, 0.11), M.black, Math.cos(a) * 0.55, 2.55, Math.sin(a) * 0.55);
      cd.rotation.y = -a;
      const seam = add(new THREE.BoxGeometry(0.03, 3.0, 0.03), this.mats.trim, Math.cos(a + Math.PI / 4) * 0.5, 2.6, Math.sin(a + Math.PI / 4) * 0.5, false);
      seam.rotation.y = -a;
    }
    add(new THREE.CylinderGeometry(0.78, 0.6, 0.38, 14), M.steelDark, 0, 4.55, 0);
    // three struts up to the gimbal
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      const st = add(new THREE.BoxGeometry(0.1, 1.5, 0.1), M.steelDark, Math.cos(a) * 0.95, 5.0, Math.sin(a) * 0.95);
      st.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
    }
    // gimbal head: outer ring with the prism sockets, tumbling inner ring, the core
    this.headY = 5.55;
    this.outer = new THREE.Group();
    this.outer.position.y = this.headY;
    g.add(this.outer);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.11, 10, 72), this.mats.steel);
    ring.castShadow = true;
    this.outer.add(ring);
    const ringTrim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.035, 6, 72), this.mats.trim);
    ringTrim.position.z = 0.1;
    this.outer.add(ringTrim);
    this.sockets = [];
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + (k / 3) * Math.PI * 2;
      const sg = new THREE.Group();
      sg.position.set(Math.cos(a) * 1.9, Math.sin(a) * 1.9, 0);
      sg.rotation.z = a - Math.PI / 2;
      const house = new THREE.Mesh(rbox(0.42, 0.34, 0.36, 0.06), this.mats.dark);
      house.castShadow = true;
      sg.add(house);
      const crystal = new THREE.Mesh(crystalGeometry(), this.mats.crystal);
      crystal.position.y = -0.3;
      crystal.rotation.z = Math.PI;
      crystal.visible = false;
      sg.add(crystal);
      const glow = glowSprite(GOLD.clone().multiplyScalar(0.5), 1.0);
      glow.position.y = -0.3;
      crystal.add(glow);
      this.outer.add(sg);
      this.sockets.push({ group: sg, crystal });
    }
    this.inner = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.07, 8, 56), M.steelDark);
    this.outer.add(this.inner);
    this.coreMat = new THREE.MeshStandardMaterial({ color: 0x14161a, emissive: new THREE.Color(1, 0.62, 0.22), emissiveIntensity: 0, metalness: 0.4, roughness: 0.15 });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.52, 28, 18), this.coreMat);
    this.core.position.y = this.headY;
    g.add(this.core);
    this.coreGlow = glowSprite(GOLD.clone(), 4);
    this.coreGlow.position.y = this.headY;
    this.coreGlow.material.opacity = 0;
    g.add(this.coreGlow);
    // the beam of daylight it throws into the sky
    this.pillarMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.8), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
    this.pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.1, 320, 24, 1, true), this.pillarMat);
    this.pillar.position.y = this.headY + 160;
    this.pillar.frustumCulled = false;
    g.add(this.pillar);
    this.groundGlow = new THREE.Mesh(new THREE.CircleGeometry(9, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 0.8, 0.3), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    this.groundGlow.rotation.x = -Math.PI / 2;
    this.groundGlow.position.y = 0.62;
    g.add(this.groundGlow);
    // signage on the plinth
    const sign = makeSign([{ text: 'PROJECT DAYBREAK', size: 64 }, { text: 'AVION SOLAR DISPLACEMENT ARRAY', size: 26, weight: 600 }], { w: 512, h: 160, bg: '#15181b', fg: '#ffd890', accent: '#ffb347' });
    const sm = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.66), std({ map: sign, roughness: 0.6, emissive: 0xffffff, emissiveMap: sign, emissiveIntensity: 0.35 }));
    const dir = Math.atan2(this.cfg.console.x - x, this.cfg.console.z - z) + 0.55;
    sm.position.set(Math.sin(dir) * 2.86, 0.3, Math.cos(dir) * 2.86);
    sm.rotation.y = dir;
    g.add(sm);
    game.scene.add(g);
    game.world.physics.addCylinder({ x, z, r: 2.95, y0: gy - 0.2, y1: gy + 0.6, walkable: true, material: 'metal' });
    game.world.physics.addCylinder({ x, z, r: 0.75, y0: gy + 0.6, y1: gy + 6.8, walkable: false, material: 'metal' });

    // console: pedestal, tilted status screen, big ignition button
    const c = this.cfg.console;
    const cy = game.world.physics.groundHeight(c.x, c.z, 0.3, 100);
    const cg = new THREE.Group();
    cg.position.set(c.x, cy, c.z);
    cg.rotation.y = Math.atan2(c.x - x, c.z - z);
    const ped = new THREE.Mesh(boxGeometry(0.85, 1.0, 0.55, 1), M.steelDark);
    ped.position.y = 0.5;
    ped.castShadow = true;
    cg.add(ped);
    const hz = new THREE.Mesh(boxGeometry(0.86, 0.12, 0.56, 1), M.hazard);
    hz.position.y = 0.12;
    cg.add(hz);
    const top = new THREE.Group();
    top.position.set(0, 1.05, 0.02);
    top.rotation.x = 0.55; // tilted toward whoever stands at it, like a lectern
    cg.add(top);
    const slab = new THREE.Mesh(boxGeometry(0.95, 0.07, 0.7, 1), M.steelDark);
    top.add(slab);
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 512;
    this.screenCanvas.height = 320;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.45), new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.5, 1.5, 1.5) }));
    screen.rotation.x = -Math.PI / 2;
    screen.position.set(-0.08, 0.04, -0.05);
    top.add(screen);
    this.buttonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 0.25, 0.05) });
    const button = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.07, 16), this.buttonMat);
    button.position.set(0.36, 0.06, 0.18);
    top.add(button);
    game.scene.add(cg);
    game.world.physics.addBox({ x: c.x, y: cy, z: c.z, w: 0.9, h: 1.15, d: 0.65, rot: cg.rotation.y, walkable: false, material: 'metal' });
  }

  _buildMirrors() {
    const game = this.game;
    const M = game.world.materials;
    const { x: mx, z: mz } = this.cfg.machine;
    this.mirrors = this.cfg.mirrors.map((d, i) => {
      const y = game.world.physics.groundHeight(d.x, d.z, 0.3, 100);
      const g = new THREE.Group();
      g.position.set(d.x, y, d.z);
      const base = new THREE.Mesh(boxGeometry(0.9, 0.3, 0.9, 1), M.concrete);
      base.position.y = 0.15;
      base.castShadow = true;
      g.add(base);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, 2.7, 10), this.mats.steel);
      post.position.y = 1.6;
      post.castShadow = true;
      g.add(post);
      const box = new THREE.Mesh(rbox(0.3, 0.36, 0.22, 0.04), M.steelDark);
      box.position.set(0, 1.1, 0.15);
      g.add(box);
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.3, 0.2) });
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), lampMat);
      lamp.position.set(0, 1.2, 0.27);
      g.add(lamp);
      // yoke + mirror panel on a pivot at the top of the post
      const pivot = new THREE.Group();
      pivot.position.y = 3.05;
      g.add(pivot);
      const yoke = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.09, 0.09), M.steelDark);
      yoke.position.z = -0.12;
      pivot.add(yoke);
      const back = new THREE.Mesh(rbox(1.9, 1.4, 0.07, 0.03), M.steelDark);
      back.position.z = -0.05;
      back.castShadow = true;
      pivot.add(back);
      const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 1.28), this.mats.mirror);
      glass.position.z = -0.012;
      pivot.add(glass);
      for (const sy of [-1, 1]) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.05, 0.06), this.mats.steel);
        rib.position.set(0, sy * 0.7, -0.02);
        pivot.add(rib);
      }
      game.scene.add(g);
      // aimed at the array's core, or knocked off line
      const corePos = new THREE.Vector3(mx, this.gy + this.headY, mz);
      const pw = new THREE.Vector3(d.x, y + 3.05, d.z);
      const m4 = new THREE.Matrix4().lookAt(corePos, pw, new THREE.Vector3(0, 1, 0));
      const onQ = new THREE.Quaternion().setFromRotationMatrix(m4);
      const away = Math.atan2(pw.x - mx, pw.z - mz) + [2.1, -1.9, 2.6][i];
      const offQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95 - i * 0.15, away, 0.25 * (i - 1), 'YXZ'));
      // beam from the mirror to the core
      const len = pw.distanceTo(corePos);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.09, len, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.5, 0.5), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      beam.position.copy(pw).add(corePos).multiplyScalar(0.5);
      beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), corePos.clone().sub(pw).normalize());
      beam.visible = false;
      game.scene.add(beam);
      const mirror = { i, g, pivot, lampMat, onQ, offQ, beam, aligned: false, anim: 0, pos: pw };
      const col = game.world.physics.addBox({ x: d.x, y: y + 2.3, z: d.z, w: 1.6, h: 1.6, d: 1.6, walkable: false, material: 'metal', nav: false, climbable: false });
      col.onShot = (hit) => this.mirrorShot(mirror, hit);
      game.world.physics.addCylinder({ x: d.x, z: d.z, r: 0.5, y0: y, y1: y + 2.3, walkable: false, material: 'metal' });
      return mirror;
    });
  }

  // ---- console status screen ------------------------------------------------------------------
  _drawScreen() {
    const lines = this._screenLines();
    const text = lines.map((l) => l.join('|')).join('/');
    if (text === this.screenText) return;
    this.screenText = text;
    const c = this.screenCanvas.getContext('2d');
    c.fillStyle = '#0b0d0f';
    c.fillRect(0, 0, 512, 320);
    c.strokeStyle = '#ffb347';
    c.lineWidth = 3;
    c.strokeRect(6, 6, 500, 308);
    c.font = '700 40px "Barlow Condensed", Arial, sans-serif';
    c.fillStyle = '#ffd890';
    c.fillText('PROJECT DAYBREAK', 24, 54);
    c.font = '600 30px "Share Tech Mono", monospace';
    lines.forEach(([label, value, color], i) => {
      c.fillStyle = '#9aa0a6';
      c.fillText(label, 24, 108 + i * 48);
      c.fillStyle = color;
      c.textAlign = 'right';
      c.fillText(value, 488, 108 + i * 48);
      c.textAlign = 'left';
    });
    this.screenTex.needsUpdate = true;
  }

  _screenLines() {
    const power = this.game.world.power;
    const aligned = this.alignedCount;
    const ok = '#8dffb4';
    const bad = '#ff6a5a';
    let status = ['STATUS', 'STANDBY', '#ffd890'];
    if (this.done) status = ['STATUS', 'COMPLETE', ok];
    else if (this.phase === 'day') status = ['STATUS', 'DAYLIGHT', ok];
    else if (this.phase === 'ready') status = ['STATUS', 'READY', ok];
    else if (this.phase === 'charging') status = ['CHARGE', Math.floor(this.charge * 100) + '%', '#ffd890'];
    else if (this.phase === 'intro') status = ['STATUS', 'OVERLOAD', bad];
    else if (this.armed) status = ['STATUS', 'ARMED', ok];
    return [
      ['PRISMS', this.installed + '/3', this.installed >= 3 ? ok : bad],
      ['POWER', power ? 'ONLINE' : 'OFFLINE', power ? ok : bad],
      ['HELIOSTATS', aligned + '/3', aligned >= 3 ? ok : bad],
      status,
    ];
  }

  get alignedCount() {
    return this.mirrors.filter((m) => m.aligned).length;
  }

  get armed() {
    return this.installed >= 3 && this.alignedCount >= 3 && this.game.world.power;
  }

  get fighting() {
    return ['intro', 'charging', 'ready', 'day'].includes(this.phase);
  }

  // ---- easter egg steps ------------------------------------------------------------------------
  discover() {
    if (this.discovered) return;
    this.discovered = true;
  }

  takePrism(pickup) {
    if (this.found.has(pickup.data.id)) return;
    this.found.add(pickup.data.id);
    this.held++;
    this.discover();
    audio.play('prism_take', { volume: 0.9 });
    audio.stopLoop('prism_' + pickup.data.id, 0.2);
    const left = this.cfg.prisms.filter((p) => !this.found.has(p.id)).map((p) => p.name);
    this.game.hud.message('PRISM RECOVERED ' + this.found.size + '/3', left.length ? 'Still missing: ' + left.join(' • ') : 'All three found. Install them in the Daybreak array on the yard helipad.', 4.5, 'perk');
    this.game.flash(0.15, 0xffc861);
  }

  mirrorShot(m, hit) {
    const game = this.game;
    game.particles.sparks(hit.x, hit.y, hit.z, hit.nx, hit.ny, hit.nz, 8, [1, 0.9, 0.6]);
    if (m.aligned || m.anim > 0) return;
    this.discover();
    if (!game.world.power) {
      if (game.time - this.warnT > 3) {
        this.warnT = game.time;
        game.hud.message('', 'The heliostat servos need power. Restore it in Hangar 2.', 3, 'small');
      }
      audio.play3D('impact_metal', m.pos, { volume: 0.8, refDistance: 6, rate: 0.6 });
      return;
    }
    m.anim = 0.001;
    audio.play3D('mirror_servo', m.pos, { volume: 1, refDistance: 7 });
  }

  installPrisms() {
    const n = this.held;
    if (n <= 0) return;
    for (let k = 0; k < n && this.installed < 3; k++) {
      this.sockets[this.installed].crystal.visible = true;
      this.installed++;
    }
    this.held = 0;
    audio.play3D('prism_install', this.console.pos, { volume: 1, refDistance: 6 });
    const more = 3 - this.installed;
    this.game.hud.message('PRISMS INSTALLED ' + this.installed + '/3', more ? `Find ${more} more prism${more > 1 ? 's' : ''}.` : this.game.world.power ? 'Now shoot the three heliostat mirrors to aim them at the array.' : 'Now restore power, then aim the heliostat mirrors.', 4, 'perk');
  }

  consolePrompt() {
    const power = this.game.world.power;
    if (this.done) return { text: 'Project Daybreak complete', cost: null, disabled: true, sub: 'The night is over.' };
    if (this.phase === 'ready') return { text: 'Ignite DAYBREAK', cost: 0, sub: 'Bring the sun up and break its shield' };
    if (this.phase === 'charging') return { text: 'Daybreak array charging: ' + Math.floor(this.charge * 100) + '%', cost: null, disabled: true, sub: 'Survive the night' };
    if (this.phase === 'day') return { text: 'Daylight active', cost: null, disabled: true, sub: 'Shoot the glowing core!' };
    if (this.phase === 'intro') return null;
    if (this.held > 0) return { text: `Install Daybreak prism${this.held > 1 ? 's' : ''} (${this.held})`, cost: 0, sub: `${this.installed}/3 installed` };
    if (this.installed < 3) return { text: `Daybreak array: ${this.installed}/3 prisms`, cost: null, disabled: true, sub: 'Missing: ' + this.cfg.prisms.filter((p) => !this.found.has(p.id)).map((p) => p.name).join(' • ') };
    if (!power) return { text: 'Daybreak array: no power', cost: null, disabled: true, sub: 'Restore power at the main switch in Hangar 2' };
    if (this.alignedCount < 3) return { text: `Heliostats aligned: ${this.alignedCount}/3`, cost: null, disabled: true, sub: 'Shoot each mirror around the array to aim it' };
    return { text: 'Activate the Daybreak array', cost: 0, sub: 'Something in the dark will answer the light' };
  }

  useConsole() {
    this.discover();
    if (this.phase === 'ready') return this.ignite();
    if (this.fighting || this.done) return;
    if (this.held > 0) return this.installPrisms();
    if (this.armed) this.activate();
  }

  // the checklist shown under the objective
  steps() {
    const power = this.game.world.power;
    const aligned = this.alignedCount;
    const missing = this.cfg.prisms.filter((p) => !this.found.has(p.id)).map((p) => p.name).join(' • ');
    const list = [
      { text: `Recover the Daybreak prisms (${this.found.size}/3)`, hint: missing, done: this.found.size >= 3 },
      { text: `Install them in the array (${this.installed}/3)`, hint: 'Console at the Hangar Yard helipad', done: this.installed >= 3 },
      { text: 'Power the array', hint: 'Main power switch, back wall of Hangar 2', done: power },
      { text: `Shoot the heliostat mirrors into line (${aligned}/3)`, hint: 'Three mirrors on posts around the array', done: aligned >= 3 },
      { text: 'Activate the Daybreak array', hint: 'Use the console', done: this.activated || this.done },
    ];
    if (this.activated || this.done) {
      const hint = this.phase === 'charging' ? 'Survive while the array recharges' : this.phase === 'ready' ? 'Use the console to bring the sun up!' : this.phase === 'day' ? 'Shoot the glowing core in its chest!' : 'It is coming';
      list.push({ text: 'Defeat the Nightwarden', hint, done: this.done });
    }
    let active = false;
    return list.map((s) => {
      let state = s.done ? 'done' : 'todo';
      if (!s.done && !active) {
        state = 'active';
        active = true;
      }
      return { text: s.text, hint: s.hint, state };
    });
  }

  // ---- the fight ---------------------------------------------------------------------------------
  activate() {
    const game = this.game;
    this.activated = true;
    this.phase = 'intro';
    this.t = 0;
    this.fightTime = 0;
    game.director.paused = true;
    audio.play('power_on', { volume: 1 });
    audio.play3D('daybreak_charge', this.console.pos, { volume: 1, refDistance: 8 });
    game.hud.message('DAYBREAK ONLINE', 'Solar displacement array spinning up…', 2.4, 'perk');
    game.hud.boss(null);
    this._events = new Set();
    game.objective();
    // the briefing is moot once it is here: cut it off (or never start it)
    if (this.transmission) this.transmission.i = RADIO.length;
    else this.transmission = { i: RADIO.length, next: 0 };
    game.hud.radio('', '', 0.01);
  }

  ignite() {
    const game = this.game;
    this.phase = 'day';
    this.t = 0;
    this.cycles++;
    game.world.sky.setOverride('day', 1, 2.4);
    audio.play('daybreak_ignite', { volume: 1, bus: 'sfx' });
    game.flash(0.6, 0xfff0c8);
    game.player.addShake(0.4, 0.8);
    game.hud.message('DAYBREAK', 'The shield is down. Shoot the glowing core!', 3.5, 'perk');
    audio.announce('Daybreak.');
  }

  nightfall() {
    const game = this.game;
    this.phase = 'charging';
    this.t = 0;
    this.charge = 0;
    this.chargeTime = CHARGE_TIME;
    game.world.sky.setOverride('day', 0, 3);
    audio.play('night_fall', { volume: 0.9 });
    game.hud.message('NIGHT FALLS', 'Its shield is back. Hold out while the array recharges.', 3.5, 'danger');
  }

  onMinionKilled() {
    if (this.phase === 'charging') this.charge = Math.min(1, this.charge + 0.015);
  }

  onBossDying() {
    const game = this.game;
    audio.stopLoop('bossMusic', 2);
    game.hud.message('', '', 0.1);
    this.dyingAt = game.time;
  }

  onBossDead(boss) {
    const game = this.game;
    this.phase = 'victory';
    this.done = true;
    this.doneShowT = 14;
    const sky = game.world.sky;
    sky.setOverride('dawn', 1, 7);
    sky.setOverride('night', 0, 7);
    sky.setOverride('day', 0, 7);
    game.director.paused = false;
    audio.play('victory', { bus: 'music', volume: 0.9 });
    audio.setLoopVolume('bed', 0.32, 3);
    // the reward: every exo upgrade, a max ammo, a fat bonus
    const p = game.player;
    for (const id of Object.keys(PERKS)) {
      if (p.perks.has(id)) continue;
      p.perks.add(id);
      game.hud.addPerk(id);
      if (id === 'health') {
        p.maxHealth = 250;
        p.health = 250;
      }
      if (id === 'medic') p.medicUses++;
    }
    game.powerups.spawn('ammo', new THREE.Vector3(boss.ch.x, boss.ch.y + 1, boss.ch.z));
    game.addPoints(5000, false);
    game.stats.kills++;
    const t = formatTime(this.fightTime);
    game.hud.victory('The night is over', `The Nightwarden fell in ${t}\nReward: every Exo upgrade installed • Max Ammo • +5000`);
    audio.announce('Nightwarden neutralized. The night is over.');
    game.hud.boss(null);
    game.objective();
    const rec = loadRecords();
    rec.daybreak = Math.min(rec.daybreak || Infinity, Math.round(this.fightTime));
    saveRecords(rec);
  }

  _bossSpawn() {
    const game = this.game;
    const p = game.player.ch;
    let best = this.cfg.bossSpawns[0];
    let bestScore = -Infinity;
    for (const s of this.cfg.bossSpawns) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      const y = game.world.physics.groundHeight(s.x, s.z, 0.5, 100);
      const vis = game.world.physics.visible(game.player.eye.x, game.player.eye.y, game.player.eye.z, s.x, y + 2, s.z);
      const score = (vis ? 10 : 0) - Math.abs(d - 15);
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  _fightUpdate(dt) {
    const game = this.game;
    const boss = game.boss;
    this.t += dt;
    if (this.phase !== 'victory') this.fightTime += dt;
    const ev = (name, at, fn) => {
      if (this.t >= at && !this._events.has(name)) {
        this._events.add(name);
        fn();
      }
    };
    if (this.phase === 'intro') {
      ev('drain', 1.8, () => {
        game.world.sky.setOverride('night', 1, 2.5);
        audio.play('night_fall', { volume: 1 });
        audio.play('thunder', { volume: 0.8 });
        game.hud.message('POWER DRAIN', 'Something is pulling the light out of the array…', 2.8, 'danger');
        game.flash(0.35, 0x6a2aff);
        audio.setLoopVolume('bed', 0, 2);
      });
      ev('spawn', 3.4, () => {
        const s = this._bossSpawn();
        boss.spawn(s.x, s.z);
        audio.loop('bossMusic', 'boss_loop', { bus: 'music', volume: 0.6 });
      });
      ev('title', 6.6, () => {
        game.hud.message('THE NIGHTWARDEN', 'Shielded by the night. Hold out until the array can bring the daylight.', 5, 'danger');
        audio.announce('Warning. Subject Zero has breached containment.');
      });
      if (this.t >= 7.5) {
        this.phase = 'charging';
        this.t = 0;
        this.charge = 0;
        this.chargeTime = CHARGE_FIRST;
      }
    } else if (this.phase === 'charging') {
      const prev = this.charge;
      this.charge = Math.min(1, this.charge + dt / this.chargeTime);
      if (Math.floor(prev * 4) !== Math.floor(this.charge * 4) && this.charge < 1) audio.play3D('daybreak_charge', this.console.pos, { volume: 0.5, refDistance: 6 });
      if (this.charge >= 1) {
        this.phase = 'ready';
        this.t = 0;
        audio.play('daybreak_ready', { volume: 1 });
        game.hud.message('DAYBREAK READY', 'Get to the array console and bring the sun up!', 4, 'perk');
        audio.announce('Daybreak array charged.');
      }
    } else if (this.phase === 'ready') {
      // nag if the player is far from the console
      if (this.t > 12 && game.time - (this.nagT || 0) > 12) {
        this.nagT = game.time;
        game.hud.message('', 'Daybreak is ready. Use the console at the array!', 3, 'small');
      }
    } else if (this.phase === 'day') {
      if (this.t >= DAY_TIME) this.nightfall();
    }
    // boss bar
    if (boss.alive || boss.state === 'emerge') {
      const day = this.phase === 'day';
      const frac = clamp(boss.health / boss.maxHealth, 0, 1);
      let dayText = '';
      let dayFrac = 0;
      if (this.phase === 'intro') dayText = 'OFFLINE';
      else if (this.phase === 'charging') {
        dayText = 'CHARGING ' + Math.floor(this.charge * 100) + '%';
        dayFrac = this.charge;
      } else if (this.phase === 'ready') {
        dayText = 'READY • USE CONSOLE';
        dayFrac = 1;
      } else if (day) {
        dayText = 'DAYLIGHT ' + Math.ceil(DAY_TIME - this.t) + 's';
        dayFrac = 1 - this.t / DAY_TIME;
      }
      game.hud.boss({
        name: 'The Nightwarden',
        hp: frac,
        mode: boss.exposed ? 'exposed' : 'shielded',
        state: boss.exposed ? 'Shield broken • shoot the core' : 'Umbral shield • bullets barely scratch it',
        dayFrac, dayText, dayReady: this.phase === 'ready',
      });
    } else if (boss.state === 'dying') {
      game.hud.boss({ name: 'The Nightwarden', hp: 0, mode: 'exposed', state: 'Defeated', dayFrac: 1, dayText: '' });
    }
  }

  // ---- per frame ------------------------------------------------------------------------------
  update(dt) {
    const game = this.game;
    const t = game.time;
    const power = game.world.power;
    // radio briefing: shortly after the power comes on (free roam: right away)
    if (!this.radioAt && power && !this.done && !this.activated) this.radioAt = t + (game.freeRoam ? 5 : 8);
    if (this.radioAt && !this.transmission && t >= this.radioAt) {
      this.transmission = { i: 0, next: t };
      this.discover();
      audio.play('radio_static', { bus: 'ui', volume: 0.7 });
      game.hud.message('INCOMING TRANSMISSION', 'Avion emergency band', 2.5, 'perk');
    }
    const tr = this.transmission;
    if (tr && tr.i < RADIO.length && t >= tr.next + 1.2) {
      game.hud.radio('Dr. Ilse Voss • Project Daybreak', RADIO[tr.i], 5.6);
      if (tr.i === 0 || tr.i === RADIO.length - 1) audio.play('radio_static', { bus: 'ui', volume: 0.35 });
      tr.i++;
      tr.next = t + 4.6;
    }

    // mirrors swing into line
    for (const m of this.mirrors) {
      if (m.anim > 0 && !m.aligned) {
        m.anim = Math.min(1, m.anim + dt / 1.3);
        const e = smoothstep(0, 1, m.anim);
        m.pivot.quaternion.copy(m.offQ).slerp(m.onQ, e);
        if (m.anim >= 1) {
          m.aligned = true;
          m.lampMat.color.setRGB(0.3, 4, 0.8);
          const n = this.alignedCount;
          game.hud.message('HELIOSTAT ALIGNED ' + n + '/3', n < 3 ? 'Shoot the other mirrors around the array.' : this.installed >= 3 ? 'Array armed. Activate it at the console.' : 'Install all three prisms to arm the array.', 3.5, 'perk');
          audio.play3D('prism_install', m.pos, { volume: 0.6, refDistance: 6, rate: 1.2 });
        }
      }
      m.beam.visible = m.aligned && power && !this.done;
    }

    // machine animation: idle drift, spin-up while charging, blaze in daylight
    const fighting = this.fighting;
    const day = this.phase === 'day';
    const armed = this.armed;
    const spin = this.done ? 0.15 : day ? 2.4 : this.phase === 'ready' ? 1.2 : fighting ? 0.4 + this.charge * 1.4 : armed ? 0.35 : power ? 0.12 : 0.02;
    this.outer.rotation.y += dt * spin;
    this.inner.rotation.x += dt * spin * 1.7;
    let coreK = 0;
    if (this.phase === 'intro') coreK = this.t < 1.8 ? 2 + this.t * 2 : Math.max(0, 1 - (this.t - 1.8)) * (Math.random() < 0.3 ? 0 : 3);
    else if (this.phase === 'charging') coreK = 0.2 + this.charge * 1.6;
    else if (this.phase === 'ready') coreK = 2.2 + Math.sin(t * 6) * 0.8;
    else if (day) coreK = 5;
    else if (this.done) coreK = 1.2;
    else if (armed) coreK = 0.5 + Math.sin(t * 2) * 0.15;
    else if (this.installed > 0) coreK = 0.08 * this.installed;
    this.coreMat.emissiveIntensity = coreK;
    this.coreGlow.material.opacity = clamp(coreK / 3, 0, 1);
    this.coreGlow.scale.setScalar(3 + coreK * 1.4);
    const dayK = game.world.sky.overrideWeight('day');
    this.pillar.visible = day || dayK > 0.02;
    this.pillarMat.opacity = (day ? 0.32 : 0) * clamp(this.t / 0.8, 0, 1) + dayK * 0.12;
    this.groundGlow.visible = this.pillar.visible;
    this.groundGlow.material.opacity = this.pillarMat.opacity * 0.35;
    for (const m of this.mirrors) m.beam.material.opacity = day ? 0.65 : this.phase === 'ready' ? 0.4 : 0.14 + Math.sin(t * 2 + m.i) * 0.04;
    const trimK = power ? (day ? 4 : 0.6 + this.charge * 1.5) : 0.05;
    this.mats.trim.color.setRGB(1 * trimK, 0.62 * trimK, 0.2 * trimK);
    this.buttonMat.color.setRGB(this.phase === 'ready' || (armed && !fighting && !this.done) ? 4 + Math.sin(t * 8) * 2 : 0.6, 0.25, 0.05);
    if (power && !this.done) audio.loop('daybreakHum', 'daybreak_hum', { pos: new THREE.Vector3(this.cfg.machine.x, this.gy + 3, this.cfg.machine.z), volume: 0.5, refDistance: 5 });
    else audio.stopLoop('daybreakHum', 1);

    if (fighting || this.phase === 'victory') this._fightUpdate(dt);
    if (this.phase === 'victory' && game.boss.state === 'dead') {
      this.doneShowT -= dt;
    }
    this._drawScreen();

    // quest tracker
    const show = this.discovered && (!this.done || this.doneShowT > 0);
    if (show) game.hud.quest(this.done ? 'Project Daybreak • complete' : 'Project Daybreak', this.steps());
    else game.hud.quest(null, null);
  }
}
