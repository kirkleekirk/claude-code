import * as THREE from 'three';
import { weaponModel, handModel } from '../world/Models.js';
import { def } from '../data/items.js';
import { weaponStats } from '../game/weapons.js';
import { damp, clamp, easeOutCubic, easeInOut } from '../core/math.js';
import { radialTexture } from '../world/Textures.js';

// First-person hands and weapon, rendered in their own scene on top of the
// world so they never clip into walls. Combat drives it through `state`.

const HIP = {
  knife: { p: [0.19, -0.15, -0.38], r: [0.18, 0.1, 0] },
  blunt: { p: [0.3, -0.27, -0.46], r: [-0.4, 0.15, -0.55] },
  pistol: { p: [0.15, -0.13, -0.36], r: [0.02, 0.03, 0] },
  long: { p: [0.14, -0.14, -0.32], r: [0.02, 0.03, 0] },
  bow: { p: [0.02, -0.07, -0.44], r: [0.0, 0.06, 0.2] },
  fists: { p: [0.2, -0.2, -0.38], r: [0.3, 0, 0] },
};

// Where the hands go on each gun, in the gun's own space: the firing hand on the grip
// and, for long guns, the other hand under the fore-end (a pump carries it with it).
const GRIP = {
  zip_pistol: [0, -0.045, 0.02], pistol: [0, -0.05, 0.02], revolver: [0, -0.045, 0.03], m1911: [0, -0.05, 0.022], m17: [0, -0.05, 0.02],
  photon_pistol: [0, -0.05, 0.03], herder_horn: [0, -0.05, 0.03],
  pipe_shotgun: [0, -0.04, 0.04], sawed_off: [0, -0.05, 0.05], shotgun: [0, -0.03, 0.05], combat_shotgun: [0, -0.05, 0.08],
  old_rifle: [0, -0.03, 0.07], lever_rifle: [0, -0.03, 0.07], rifle: [0, -0.03, 0.07], dmr: [0, -0.05, 0.08], smg: [0, -0.05, 0.05],
  ar15: [0, -0.05, 0.06], m4: [0, -0.05, 0.06], arc_carbine: [0, -0.035, 0.05], scatter_emitter: [0, -0.035, 0.05], beam_lance: [0, -0.035, 0.05],
  crossbow: [0, -0.04, 0.03],
};
const FORE = {
  pipe_shotgun: [0, -0.008, -0.25], sawed_off: [0, -0.001, -0.14], shotgun: [0, -0.016, 0], combat_shotgun: [0, -0.01, -0.28],
  old_rifle: [0, -0.022, -0.2], lever_rifle: [0, -0.02, -0.22], rifle: [0, -0.022, -0.2], dmr: [0, -0.005, -0.26], smg: [0, -0.01, -0.12],
  ar15: [0, -0.004, -0.22], m4: [0, -0.004, -0.22], arc_carbine: [0, -0.012, -0.22], scatter_emitter: [0, -0.016, -0.2], beam_lance: [0, -0.012, -0.3],
  crossbow: [0, -0.006, -0.16],
};
// the support hand under a fore-end: palm up, fingers curled round its left side
const FORE_HAND = { off: new THREE.Vector3(-0.008, -0.026, 0.0), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.45, 0.12, 0.32)) };
// cupping a pistol's grip from below-left when aiming it two-handed
const CUP_HAND = { off: new THREE.Vector3(-0.03, -0.035, -0.005), rot: new THREE.Quaternion().setFromEuler(new THREE.Euler(0.25, 0.35, 0.9)) };
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class ViewModel {
  constructor(aspect) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, aspect, 0.01, 20);
    this.amb = new THREE.HemisphereLight(0xc8ccd8, 0x3a3a30, 1);
    this.scene.add(this.amb);
    this.key = new THREE.DirectionalLight(0xffffff, 1.2);
    this.key.position.set(0.5, 1, 0.4);
    this.scene.add(this.key);
    this.torch = new THREE.PointLight(0xfff2da, 0, 3, 1.5);
    this.torch.position.set(0.1, 0.1, 0.2);
    this.scene.add(this.torch);
    this.flashL = new THREE.PointLight(0xffb060, 0, 3, 1.2);
    this.scene.add(this.flashL);

    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.rGroup = new THREE.Group();
    this.lGroup = new THREE.Group();
    this.root.add(this.rGroup, this.lGroup);
    this.rHand = handModel(false);
    this.lHand = handModel(true);
    this.rGroup.add(this.rHand);
    this.lGroup.add(this.lHand);
    this.lGroup.visible = false;
    this.holder = new THREE.Group();
    this.rGroup.add(this.holder);
    this.weapon = null;
    this.parts = {};

    const flashMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,230,160,1)', 'rgba(255,120,30,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
    this.flash.visible = false;
    this.flashT = 0;

    // loose magazine / shell / round held by the left hand during reloads
    this.prop = new THREE.Group();
    this.lGroup.add(this.prop);

    this.cls = 'fists';
    this.cur = { p: new THREE.Vector3(), r: new THREE.Vector3() };
    this.lCur = { p: new THREE.Vector3(-0.3, -0.5, -0.3), r: new THREE.Vector3() };
    this.lagX = 0;
    this.lagY = 0;
    this.recoil = 0;
    this.recoilV = 0;
    this.drawT = 1;
    this.time = 0;
    this.attachW = 0;
    this.grip = null;
    this.fore = null;
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(item) {
    if (this.weapon) this.holder.remove(this.weapon);
    this.weapon = null;
    this.parts = {};
    this.rear = [];
    this.id = item ? item.id : null;
    this.rHand.position.set(0, 0, 0);
    this.rHand.rotation.set(0, 0, 0);
    this.grip = null;
    this.fore = null;
    if (!item) {
      this.cls = 'fists';
      this.drawT = 0;
      return;
    }
    const d = def(item.id);
    const stats = d.kind === 'gun' ? weaponStats(item) : d;
    this.stats = stats;
    const m = weaponModel(item.id, item.mods);
    m.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
      if (o.name) this.parts[o.name] = o;
    });
    this.parts.muzzle = m.getObjectByName('muzzle');
    if (this.parts.muzzle) this.parts.muzzle.add(this.flash);
    if (this.parts.sup) this.parts.sup.visible = !!item.sup;
    this.weapon = m;
    this.holder.add(m);
    this.sightY = (m.userData.sightY ?? 0.05) + (stats.sightY || 0);
    this.setDraw = m.userData.setDraw || null;
    if (d.kind === 'gun') this.cls = d.action === 'bow' ? 'bow' : d.hold || (d.slot === 'sidearm' ? 'pistol' : 'long');
    else this.cls = d.slot === 'knife' ? 'knife' : 'blunt';
    this.def = d;
    this.drawT = 0;
    // the firing hand wraps the grip rather than sitting on top of the receiver
    if (d.kind === 'gun' && this.cls !== 'bow') {
      const g = GRIP[item.id] || (this.cls === 'pistol' ? [0, -0.05, 0.025] : [0, -0.04, 0.06]);
      this.grip = new THREE.Vector3(...g);
      this.rHand.position.set(g[0] + 0.008, g[1] + 0.024, g[2] + 0.014);
      this.rHand.rotation.set(-0.3, 0.12, -0.32);
      const f = FORE[item.id] || (this.cls === 'long' ? [0, -0.012, -0.2] : null);
      this.fore = f ? new THREE.Vector3(...f) : null;
    }
    // a long gun's stock sits right under your eye when you aim; tuck it away then
    this.rear = [];
    if (this.cls === 'long') {
      // measured in the gun's own space, wherever the hands happen to be
      const bb = new THREE.Box3(), c = new THREE.Vector3();
      this.holder.remove(m);
      m.updateMatrixWorld(true);
      m.traverse((o) => { if (o.isMesh && bb.setFromObject(o).getCenter(c).z > 0.13) this.rear.push(o); });
      this.holder.add(m);
    }
    this.magBase = this.parts.mag ? this.parts.mag.position.clone() : null;
    this.slideBase = this.parts.slide ? this.parts.slide.position.clone() : null;
    this.pumpBase = this.parts.pump ? this.parts.pump.position.clone() : null;
    this.cylBase = this.parts.cylinder ? this.parts.cylinder.position.clone() : null;
    this.stringBase = this.parts.string ? this.parts.string.position.clone() : null;
    // what the off hand carries during reloads
    while (this.prop.children.length) this.prop.remove(this.prop.children[0]);
    if (d.kind === 'gun' && d.action !== 'bow') {
      const shell = d.ammo === 'ammo_12g';
      const col = d.energy ? 0xd8542e : { mag: 0x26282a, cyl: 0xb08d3a, pump: 0xa02a20, bolt: 0xb08d3a, xbow: 0x9a9ea3, break: shell ? 0xa02a20 : 0xb08d3a }[d.action];
      const size = d.action === 'mag' ? [0.022, 0.1, 0.035] : shell ? [0.022, 0.022, 0.065] : d.action === 'xbow' ? [0.01, 0.01, 0.3] : [0.01, 0.01, 0.04];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color: col }));
      mesh.position.set(0, 0.02, -0.07);
      mesh.frustumCulled = false;
      this.prop.add(mesh);
    }
  }

  updateSuppressor(item) {
    if (this.parts.sup) this.parts.sup.visible = !!(item && item.sup);
  }

  muzzle(intensity = 1, laser = false) {
    this.flash.material.color.setHex(laser ? 0xff5a3a : 0xffffff);
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6 * intensity);
    this.flashT = 0.05;
    this.flashL.intensity = 4 * intensity;
    this.flashL.color.setHex(laser ? 0xff4a2a : 0xffb060);
  }

  // Where the muzzle is in the world, for drawing beams from the gun.
  muzzleWorld(camera) {
    const m = this.parts.muzzle;
    if (!m) return null;
    const v = m.getWorldPosition(new THREE.Vector3());
    // view-model space -> world: the view model camera sits at the world camera
    v.applyMatrix4(camera.matrixWorld);
    return v;
  }

  kick(amount) {
    this.recoilV += amount;
  }

  // s: see Combat.vmState()
  update(dt, s, env) {
    this.time += dt;
    const t = this.time;
    // lighting follows the world
    if (env) {
      this.amb.color.copy(env.hemi.color);
      this.amb.groundColor.copy(env.hemi.groundColor);
      this.amb.intensity = env.hemi.intensity * 0.8 + 0.25;
      this.key.color.copy(env.sun.color);
      this.key.intensity = s.indoors ? env.sun.intensity * 0.15 : env.sun.intensity * 0.55;
    }
    this.torch.intensity = s.flashlight ? 0.9 : 0;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashL.intensity = 0; }
    }

    this.drawT = Math.min(1, this.drawT + dt * 3.2);
    const base = HIP[this.cls];
    const p = new THREE.Vector3(...base.p);
    const r = new THREE.Vector3(...base.r);

    // ADS
    if ((this.cls === 'pistol' || this.cls === 'long' || this.cls === 'bow') && s.ads > 0) {
      const ads = easeInOut(s.ads);
      const scoped = this.stats && this.stats.scope;
      const z = this.cls === 'pistol' ? -0.42 : this.cls === 'bow' ? -0.4 : scoped ? -0.2 : -0.34;
      p.lerp(new THREE.Vector3(0, -this.sightY, z), ads);
      r.multiplyScalar(1 - ads);
    }

    // the off hand: free (reaching, reloading, grabbing) or holding the gun. `rel` marks a
    // pose placed relative to the gun, which moves with it when sprinting or bobbing.
    const L = { p: new THREE.Vector3(-0.32, -0.55, -0.3), r: new THREE.Vector3(0, 0, 0), vis: false, rel: false, free: false };
    const p0 = p.clone();

    // melee motion
    const m = s.melee;
    if (m) {
      if (this.cls === 'knife' || this.cls === 'fists') {
        if (m.phase === 'windup') {
          const k = easeOutCubic(Math.min(1, m.charge * 1.4 + 0.15));
          p.add(new THREE.Vector3(0.03 * k, 0.03 * k, 0.16 * k));
          r.x += 0.2 * k;
          p.x += Math.sin(t * 40) * 0.002 * m.charge;
        } else if (m.phase === 'strike') {
          const k = Math.sin(Math.min(1, m.k) * Math.PI * 0.5);
          p.add(new THREE.Vector3(-0.06 * k, 0.05 * k, -0.3 * k));
          r.x -= 0.1 * k;
        } else if (m.phase === 'recover') {
          const k = 1 - easeOutCubic(m.k);
          p.add(new THREE.Vector3(-0.06 * k, 0.05 * k, -0.3 * k));
        }
      } else {
        if (m.phase === 'windup') {
          const k = easeOutCubic(Math.min(1, m.charge * 1.3 + 0.2));
          p.add(new THREE.Vector3(0.1 * k, 0.2 * k, 0.12 * k));
          r.x += 1.2 * k;
          r.z += -0.55 * k;
          r.y += 0.3 * k;
          p.x += Math.sin(t * 40) * 0.002 * m.charge;
        } else if (m.phase === 'strike') {
          const k = easeInOut(Math.min(1, m.k));
          p.add(new THREE.Vector3(0.1 - 0.34 * k, 0.2 - 0.34 * k, 0.12 - 0.36 * k));
          r.x += 1.2 - 2.3 * k;
          r.z += -0.55 + 1.05 * k;
          r.y += 0.3 - 0.5 * k;
        } else if (m.phase === 'recover') {
          const k = 1 - easeOutCubic(m.k);
          p.add(new THREE.Vector3(-0.24 * k, -0.14 * k, -0.24 * k));
          r.x += -1.1 * k;
          r.z += 0.5 * k;
          r.y += -0.2 * k;
        }
      }
      if (m.phase === 'stuck') {
        // hand wrenched down with the falling body
        const pull = m.pull || 0;
        p.set(0.02, -0.28 - m.sag * 0.12 + pull * 0.08, -0.5 + pull * 0.12);
        r.set(this.cls === 'knife' ? -0.5 : -1.4, 0, this.cls === 'knife' ? 0 : 0.6);
        p.x += Math.sin(t * 55) * 0.006 * (0.3 + pull);
        p.y += Math.cos(t * 47) * 0.005 * (0.3 + pull);
      }
    }

    // grab / hold with the off hand
    if (s.holding) {
      L.vis = true;
      L.free = true;
      L.p.set(-0.1 + Math.sin(t * 13) * 0.012, -0.12 + Math.cos(t * 11) * 0.012, -0.62);
      L.r.set(0.35, 0.1, 0.2);
    } else if (s.grabReach > 0) {
      L.vis = true;
      L.free = true;
      const k = Math.sin(s.grabReach * Math.PI);
      L.p.set(-0.12, -0.16, -0.35 - 0.3 * k);
      L.r.set(0.3, 0, 0.2);
    }
    if (s.shove > 0) {
      const k = Math.sin(s.shove * Math.PI);
      L.vis = true;
      L.free = true;
      L.p.set(-0.14, -0.15 + 0.03 * k, -0.34 - 0.34 * k);
      L.r.set(0.1, 0, 0.3);
      p.z -= 0.14 * k;
      p.y += 0.03 * k;
    }
    if (s.struggle) {
      L.vis = true;
      L.free = true;
      L.p.set(-0.16 + Math.sin(t * 25) * 0.02, -0.1 + Math.cos(t * 21) * 0.02, -0.45);
      L.r.set(0.2, 0, 0.4);
      p.x += Math.sin(t * 23) * 0.02;
      p.z -= 0.05;
    }

    // reload / action choreography
    const a = s.action;
    const parts = this.parts;
    let propVis = false;
    if (this.magBase && parts.mag) { parts.mag.position.copy(this.magBase); parts.mag.visible = true; }
    if (this.slideBase && parts.slide) parts.slide.position.copy(this.slideBase);
    if (this.pumpBase && parts.pump) parts.pump.position.copy(this.pumpBase);
    if (this.cylBase && parts.cylinder) { parts.cylinder.position.copy(this.cylBase); parts.cylinder.rotation.set(0, 0, 0); }
    if (this.stringBase && parts.string) parts.string.position.copy(this.stringBase);
    if (parts.bolt) parts.bolt.rotation.set(0, 0, 0);
    if (parts.barrels) parts.barrels.rotation.x = s.cylOpen ? -0.55 : 0;
    if (parts.lever) parts.lever.rotation.x = 0;
    if (this.setDraw) this.setDraw(s.draw || 0);
    if (parts.arrowNock) parts.arrowNock.visible = s.loaded > 0;
    if (parts.coil) parts.coil.scale.setScalar(1 + (s.charging || 0) * 1.5);
    if (parts.bolt) parts.bolt.position.z = 0.05;
    if (parts.boltAmmo) parts.boltAmmo.visible = s.loaded > 0;
    if (parts.mag && s.magIn === false) parts.mag.visible = false;
    if (parts.slide && s.slideBack) parts.slide.position.z = this.slideBase.z + 0.04;
    if (parts.cylinder && s.cylOpen) { parts.cylinder.position.x = this.cylBase.x - 0.035; parts.cylinder.rotation.z = 0.3; }

    if (a) {
      const k = a.k;
      const bump = Math.sin(k * Math.PI);
      if (a.name === 'magOut' || a.name === 'magIn') {
        r.z += 0.32 * bump + (a.name === 'magIn' ? 0.1 : 0);
        r.x += 0.14 * bump;
        L.vis = true;
        L.free = L.rel = true;
        const from = new THREE.Vector3(p.x - 0.02, p.y - 0.26, p.z + 0.1);
        const to = new THREE.Vector3(p.x + 0.0, p.y - 0.1, p.z + 0.02);
        if (a.name === 'magOut') {
          L.p.copy(to).lerp(from, k);
          if (parts.mag) { parts.mag.visible = k < 0.4; parts.mag.position.y = this.magBase.y - k * 0.15; }
        } else {
          L.p.copy(from).lerp(to, easeOutCubic(k));
          if (parts.mag) { parts.mag.visible = k > 0.75; }
          propVis = k <= 0.75;
        }
        L.r.set(0.4, 0, 0.6);
      } else if (a.name === 'rack' || a.name === 'clear') {
        L.vis = true;
        L.free = L.rel = true;
        L.p.set(p.x - 0.02, p.y + 0.03, p.z + 0.08 + bump * 0.06);
        L.r.set(0.2, 0.4, 1.2);
        r.z += 0.2 * bump;
        if (parts.slide) parts.slide.position.z = this.slideBase.z + 0.05 * bump;
        if (parts.bolt) { parts.bolt.rotation.z = -1.2 * bump; parts.bolt.position.z = 0.05 + 0.07 * bump; }
      } else if (a.name === 'pump') {
        if (parts.lever) parts.lever.rotation.x = 0.9 * bump;
        if (parts.pump) parts.pump.position.z = this.pumpBase.z + 0.1 * bump;
        p.z += 0.02 * bump;
        r.x += 0.08 * bump;
      } else if (a.name === 'bolt') {
        if (parts.bolt) { parts.bolt.rotation.z = -1.3 * Math.min(1, bump * 2); parts.bolt.position.z = 0.05 + 0.08 * bump; }
        L.vis = true;
        L.free = L.rel = true;
        L.p.set(p.x + 0.07, p.y + 0.02, p.z + 0.06);
        L.r.set(0, 0.3, 0.9);
        r.z += 0.1 * bump;
      } else if (a.name === 'load1' || a.name === 'open' || a.name === 'close') {
        L.vis = true;
        L.free = L.rel = true;
        propVis = a.name === 'load1' && k < 0.8;
        r.z += (this.cls === 'long' ? -0.5 : 0.5) * Math.min(1, bump * 1.8);
        r.x += 0.3 * Math.min(1, bump * 1.8);
        if (parts.barrels) {
          // break-action: the barrels hinge down to load
          parts.barrels.rotation.x = -0.55 * (a.name === 'open' ? k : a.name === 'close' ? 1 - k : 1);
        }
        if (this.cls === 'pistol' && parts.cylinder) {
          // revolver
          L.p.set(p.x - 0.06, p.y - 0.02 - 0.08 * (1 - k), p.z + 0.02);
          if (parts.cylinder && (a.name !== 'close' || k < 0.8)) {
            parts.cylinder.position.x = this.cylBase.x - 0.035 * (a.name === 'open' ? k : a.name === 'close' ? 1 - k : 1);
            parts.cylinder.rotation.z = 0.3 * (a.name === 'open' ? k : a.name === 'close' ? 1 - k : 1);
          }
        } else {
          L.p.set(p.x - 0.02, p.y - 0.12 + 0.07 * bump, p.z - 0.12);
        }
        L.r.set(0.5, 0, 0.8);
      } else if (a.name === 'crank') {
        propVis = k > 0.5;
        r.x -= 0.6 * Math.min(1, bump * 2);
        p.y -= 0.05 * bump;
        L.vis = true;
        L.free = L.rel = true;
        L.p.set(p.x - 0.05, p.y - 0.05, p.z + 0.05);
        L.r.set(0.4, 0.2, 0.6);
        if (parts.string) parts.string.position.z = this.stringBase.z + 0.16 * Math.min(1, k * 1.4);
      } else if (a.name === 'use') {
        p.y -= 0.35 * Math.min(1, bump * 3);
        L.vis = true;
        L.free = true;
        L.p.set(-0.08, -0.2 + 0.05 * Math.sin(k * 20), -0.36);
        L.r.set(0.8, 0, 0.3);
      } else if (a.name === 'helmet') {
        L.vis = true;
        L.free = true;
        L.p.set(-0.05, 0.05 - 0.2 * k, -0.55 + 0.25 * k);
        L.r.set(0.4 - k, 0, 0.3);
      }
    }
    if (parts.string && s.loaded > 0 && !(a && a.name === 'crank')) parts.string.position.z = this.stringBase.z + 0.16;

    // running: each kind of weapon is carried its own way, and swings with the stride
    // (a reload or a swing takes the weapon back up)
    const run = (s.sprint || 0) * (a || (m && m.phase !== 'idle') ? 0.3 : 1);
    if (run > 0) {
      const st = s.bob || 0;
      if (this.cls === 'long') {
        // across the chest, muzzle up and to the left
        p.x -= 0.07 * run; p.y -= 0.03 * run; p.z += 0.05 * run;
        r.y += 0.8 * run; r.x += 0.22 * run; r.z += 0.42 * run;
        p.y += Math.sin(st * 2) * 0.012 * run;
        r.z += Math.sin(st) * 0.07 * run;
      } else if (this.cls === 'pistol') {
        // arm down by the side, pumping with the stride
        p.x -= 0.02 * run; p.y -= 0.06 * run; p.z += 0.05 * run;
        r.x -= 0.55 * run; r.y += 0.3 * run; r.z -= 0.15 * run;
        p.z += Math.sin(st) * 0.05 * run;
        r.x += Math.sin(st) * 0.22 * run;
      } else if (this.cls === 'bow') {
        // held low and flat, out of the way
        p.x += 0.06 * run; p.y -= 0.1 * run; p.z += 0.04 * run;
        r.z += 1.15 * run; r.y += 0.25 * run; r.x -= 0.2 * run;
        p.y += Math.sin(st * 2) * 0.01 * run;
      } else if (this.cls === 'blunt') {
        // carried low and swinging with the arm, head tipped back
        p.x -= 0.03 * run; p.y -= 0.05 * run; p.z += 0.03 * run;
        r.x += 0.3 * run; r.z += 0.2 * run;
        p.z += Math.sin(st) * 0.05 * run;
        p.y += Math.abs(Math.cos(st)) * 0.02 * run;
        r.x += Math.sin(st) * 0.18 * run;
      } else {
        // knife and fists: arms pump
        p.y -= 0.03 * run; p.z += 0.03 * run;
        r.x -= 0.25 * run;
        p.z += Math.sin(st) * 0.06 * run;
        p.y += Math.cos(st) * 0.02 * run;
        r.x += Math.sin(st) * 0.22 * run;
      }
    }
    const drawK = 1 - easeOutCubic(this.drawT);
    p.y -= drawK * 0.35;
    r.x -= drawK * 0.8;
    if (s.holster > 0) { p.y -= s.holster * 0.4; r.x -= s.holster * 0.8; }

    // bob + look lag + sway + recoil spring
    const bobK = s.ads > 0.5 ? 0.25 : 1;
    const walk = s.bobAmt * bobK * (1 - 0.6 * (s.sprint || 0));
    p.x += Math.sin(s.bob) * 0.013 * walk;
    p.y += -Math.abs(Math.cos(s.bob)) * 0.013 * walk + Math.sin(t * 1.4) * 0.002;
    r.z += Math.sin(s.bob) * 0.02 * walk;
    this.lagX = damp(this.lagX, clamp(-s.lookDX * 0.6, -0.06, 0.06), 10, dt);
    this.lagY = damp(this.lagY, clamp(s.lookDY * 0.6, -0.05, 0.05), 10, dt);
    p.x += this.lagX * 0.5;
    p.y += this.lagY * 0.5;
    r.y += this.lagX * 0.8;
    r.x += this.lagY * 0.6;
    r.x += s.swayY || 0;
    r.y -= s.swayX || 0;
    this.recoilV += -this.recoil * 160 * dt;
    this.recoilV *= Math.exp(-dt * 18);
    this.recoil += this.recoilV * dt;
    p.z += this.recoil * 0.06;
    r.x += this.recoil * 0.25;
    p.y += this.recoil * 0.01;

    // smooth toward targets
    const lam = m && (m.phase === 'strike') ? 40 : 18;
    this.cur.p.x = damp(this.cur.p.x, p.x, lam, dt);
    this.cur.p.y = damp(this.cur.p.y, p.y, lam, dt);
    this.cur.p.z = damp(this.cur.p.z, p.z, lam, dt);
    this.cur.r.x = damp(this.cur.r.x, r.x, lam, dt);
    this.cur.r.y = damp(this.cur.r.y, r.y, lam, dt);
    this.cur.r.z = damp(this.cur.r.z, r.z, lam, dt);
    this.rGroup.position.copy(this.cur.p);
    this.rGroup.rotation.set(this.cur.r.x, this.cur.r.y, this.cur.r.z, 'YXZ');

    if (L.rel) L.p.add(_v.copy(p).sub(p0));
    if (!L.vis) L.p.set(-0.3, -0.6, -0.25);
    this.lCur.p.x = damp(this.lCur.p.x, L.p.x, 16, dt);
    this.lCur.p.y = damp(this.lCur.p.y, L.p.y, 16, dt);
    this.lCur.p.z = damp(this.lCur.p.z, L.p.z, 16, dt);
    this.lCur.r.x = damp(this.lCur.r.x, L.r.x, 16, dt);
    this.lCur.r.y = damp(this.lCur.r.y, L.r.y, 16, dt);
    this.lCur.r.z = damp(this.lCur.r.z, L.r.z, 16, dt);
    // holding the gun: long guns by the fore-end (riding the pump), pistols cupped when aimed
    const cup = this.cls === 'pistol' && this.grip && s.ads > 0.3;
    const hold = !L.free && !(m && this.cls !== 'long') && ((this.cls === 'long' && this.fore) || cup);
    this.attachW = damp(this.attachW, hold ? 1 : 0, 14, dt);
    this.lGroup.position.copy(this.lCur.p);
    this.lGroup.quaternion.setFromEuler(_e.set(this.lCur.r.x, this.lCur.r.y, this.lCur.r.z));
    if (this.attachW > 0.001 && (this.fore || this.grip)) {
      this.rGroup.updateMatrix();
      const H = cup || !this.fore ? CUP_HAND : FORE_HAND;
      if (cup || !this.fore) _v.copy(this.grip);
      else if (this.parts.pump) _v.copy(this.parts.pump.position);
      else _v.copy(this.fore);
      if (!cup && this.fore && this.parts.pump) _v.y += this.fore.y - 0.002;
      _v.add(H.off).applyMatrix4(this.rGroup.matrix);
      _q.copy(this.rGroup.quaternion).multiply(H.rot);
      this.lGroup.position.lerp(_v, this.attachW);
      this.lGroup.quaternion.slerp(_q, this.attachW);
    }
    this.lGroup.visible = this.attachW > 0.05 || this.lCur.p.y > -0.55;
    this.prop.visible = propVis;

    for (const o of this.rear) o.visible = s.ads < 0.6;
    // scope view hides the model
    this.root.visible = !(this.stats && this.stats.scope && s.ads > 0.92);
    if (this.cls === 'fists') {
      this.rHand.rotation.x = 0.3;
    }
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

