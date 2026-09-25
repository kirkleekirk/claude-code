import * as THREE from 'three';
import { weaponModel, handModel } from '../world/Models.js';
import { def } from '../data/items.js';
import { damp, clamp, easeOutCubic, easeInOut } from '../core/math.js';
import { radialTexture } from '../world/Textures.js';

// First-person hands and weapon, rendered in their own scene on top of the
// world so they never clip into walls. Combat drives it through `state`.

const HIP = {
  knife: { p: [0.19, -0.15, -0.38], r: [0.18, 0.1, 0] },
  blunt: { p: [0.3, -0.27, -0.46], r: [-0.4, 0.15, -0.55] },
  pistol: { p: [0.15, -0.13, -0.36], r: [0.02, 0.03, 0] },
  long: { p: [0.14, -0.14, -0.32], r: [0.02, 0.03, 0] },
  fists: { p: [0.2, -0.2, -0.38], r: [0.3, 0, 0] },
};

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
  }

  setAspect(a) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  setWeapon(item) {
    if (this.weapon) this.holder.remove(this.weapon);
    this.weapon = null;
    this.parts = {};
    this.id = item ? item.id : null;
    if (!item) {
      this.cls = 'fists';
      this.drawT = 0;
      return;
    }
    const d = def(item.id);
    const m = weaponModel(item.id);
    m.traverse((o) => {
      if (o.isMesh) o.frustumCulled = false;
      if (o.name) this.parts[o.name] = o;
    });
    this.parts.muzzle = m.getObjectByName('muzzle');
    if (this.parts.muzzle) this.parts.muzzle.add(this.flash);
    if (this.parts.sup) this.parts.sup.visible = !!item.sup;
    this.weapon = m;
    this.holder.add(m);
    this.sightY = m.userData.sightY || 0.05;
    if (d.kind === 'gun') this.cls = d.slot === 'sidearm' ? 'pistol' : 'long';
    else this.cls = d.slot === 'knife' ? 'knife' : 'blunt';
    this.def = d;
    this.drawT = 0;
    this.magBase = this.parts.mag ? this.parts.mag.position.clone() : null;
    this.slideBase = this.parts.slide ? this.parts.slide.position.clone() : null;
    this.pumpBase = this.parts.pump ? this.parts.pump.position.clone() : null;
    this.cylBase = this.parts.cylinder ? this.parts.cylinder.position.clone() : null;
    this.stringBase = this.parts.string ? this.parts.string.position.clone() : null;
    // what the off hand carries during reloads
    while (this.prop.children.length) this.prop.remove(this.prop.children[0]);
    if (d.kind === 'gun') {
      const col = { mag: 0x26282a, cyl: 0xb08d3a, pump: 0xa02a20, bolt: 0xb08d3a, xbow: 0x9a9ea3 }[d.action];
      const size = d.action === 'mag' ? [0.022, 0.1, 0.035] : d.action === 'pump' ? [0.022, 0.022, 0.065] : d.action === 'xbow' ? [0.01, 0.01, 0.3] : [0.01, 0.01, 0.04];
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color: col }));
      mesh.position.set(0, 0.02, -0.07);
      mesh.frustumCulled = false;
      this.prop.add(mesh);
    }
  }

  updateSuppressor(item) {
    if (this.parts.sup) this.parts.sup.visible = !!(item && item.sup);
  }

  muzzle(intensity = 1) {
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.6 * intensity);
    this.flashT = 0.05;
    this.flashL.intensity = 4 * intensity;
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
    if ((this.cls === 'pistol' || this.cls === 'long') && s.ads > 0) {
      const ads = easeInOut(s.ads);
      const z = this.cls === 'pistol' ? -0.42 : this.id === 'rifle' ? -0.2 : -0.28;
      p.lerp(new THREE.Vector3(0, -this.sightY, z), ads);
      r.multiplyScalar(1 - ads);
    }

    const L = { p: new THREE.Vector3(-0.32, -0.55, -0.3), r: new THREE.Vector3(0, 0, 0), vis: false };
    if (this.cls === 'long') {
      L.vis = true;
      L.p.set(p.x - 0.07, p.y - 0.035, p.z - 0.3);
      L.r.set(0.1, 0, 0.5);
    } else if (this.cls === 'pistol' && s.ads > 0.3) {
      L.vis = true;
      L.p.set(p.x - 0.04, p.y - 0.06, p.z + 0.03);
      L.r.set(0.2, 0.3, 0.6);
    }

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
      L.p.set(-0.1 + Math.sin(t * 13) * 0.012, -0.12 + Math.cos(t * 11) * 0.012, -0.62);
      L.r.set(0.35, 0.1, 0.2);
    } else if (s.grabReach > 0) {
      L.vis = true;
      const k = Math.sin(s.grabReach * Math.PI);
      L.p.set(-0.12, -0.16, -0.35 - 0.3 * k);
      L.r.set(0.3, 0, 0.2);
    }
    if (s.shove > 0) {
      const k = Math.sin(s.shove * Math.PI);
      L.vis = true;
      L.p.set(-0.14, -0.15 + 0.03 * k, -0.34 - 0.34 * k);
      L.r.set(0.1, 0, 0.3);
      p.z -= 0.14 * k;
      p.y += 0.03 * k;
    }
    if (s.struggle) {
      L.vis = true;
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
    if (parts.bolt) parts.bolt.position.z = 0.05;
    if (parts.boltAmmo) parts.boltAmmo.visible = s.loaded > 0;
    if (parts.mag && s.magIn === false) parts.mag.visible = false;
    if (parts.slide && s.slideBack) parts.slide.position.z = this.slideBase.z + 0.04;
    if (parts.cylinder && s.cylOpen) { parts.cylinder.position.x = this.cylBase.x - 0.035; parts.cylinder.rotation.z = 0.3; }

    if (a) {
      const k = a.k;
      const bump = Math.sin(k * Math.PI);
      if (a.name === 'magOut' || a.name === 'magIn') {
        r.z += 0.45 * bump + (a.name === 'magIn' ? 0.2 : 0);
        r.x += 0.25 * bump;
        L.vis = true;
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
        L.p.set(p.x - 0.02, p.y + 0.03, p.z + 0.08 + bump * 0.06);
        L.r.set(0.2, 0.4, 1.2);
        r.z += 0.2 * bump;
        if (parts.slide) parts.slide.position.z = this.slideBase.z + 0.05 * bump;
        if (parts.bolt) { parts.bolt.rotation.z = -1.2 * bump; parts.bolt.position.z = 0.05 + 0.07 * bump; }
      } else if (a.name === 'pump') {
        if (parts.pump) parts.pump.position.z = this.pumpBase.z + 0.1 * bump;
        L.p.z += 0.1 * bump;
        p.z += 0.02 * bump;
        r.x += 0.08 * bump;
      } else if (a.name === 'bolt') {
        if (parts.bolt) { parts.bolt.rotation.z = -1.3 * Math.min(1, bump * 2); parts.bolt.position.z = 0.05 + 0.08 * bump; }
        L.vis = true;
        L.p.set(p.x + 0.07, p.y + 0.02, p.z + 0.06);
        L.r.set(0, 0.3, 0.9);
        r.z += 0.1 * bump;
      } else if (a.name === 'load1' || a.name === 'open' || a.name === 'close') {
        L.vis = true;
        propVis = a.name === 'load1' && k < 0.8;
        r.z += (this.cls === 'long' ? -0.5 : 0.5) * Math.min(1, bump * 1.8);
        r.x += 0.3 * Math.min(1, bump * 1.8);
        if (this.cls === 'pistol') {
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
        L.p.set(p.x - 0.05, p.y - 0.05, p.z + 0.05);
        L.r.set(0.4, 0.2, 0.6);
        if (parts.string) parts.string.position.z = this.stringBase.z + 0.16 * Math.min(1, k * 1.4);
      } else if (a.name === 'use') {
        p.y -= 0.35 * Math.min(1, bump * 3);
        L.vis = true;
        L.p.set(-0.08, -0.2 + 0.05 * Math.sin(k * 20), -0.36);
        L.r.set(0.8, 0, 0.3);
      } else if (a.name === 'helmet') {
        L.vis = true;
        L.p.set(-0.05, 0.05 - 0.2 * k, -0.55 + 0.25 * k);
        L.r.set(0.4 - k, 0, 0.3);
      }
    }
    if (parts.string && s.loaded > 0 && !(a && a.name === 'crank')) parts.string.position.z = this.stringBase.z + 0.16;

    // sprint lowers the weapon, draw raises it
    if (s.sprint > 0) {
      p.y -= 0.12 * s.sprint;
      p.x -= 0.03 * s.sprint;
      r.x -= 0.5 * s.sprint;
      r.y += 0.4 * s.sprint;
    }
    const drawK = 1 - easeOutCubic(this.drawT);
    p.y -= drawK * 0.35;
    r.x -= drawK * 0.8;
    if (s.holster > 0) { p.y -= s.holster * 0.4; r.x -= s.holster * 0.8; }

    // bob + look lag + sway + recoil spring
    const bobK = s.ads > 0.5 ? 0.25 : 1;
    p.x += Math.sin(s.bob) * 0.012 * s.bobAmt * bobK;
    p.y += -Math.abs(Math.cos(s.bob)) * 0.012 * s.bobAmt * bobK + Math.sin(t * 1.4) * 0.002;
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

    if (!L.vis) L.p.set(-0.3, -0.6, -0.25);
    this.lCur.p.x = damp(this.lCur.p.x, L.p.x, 16, dt);
    this.lCur.p.y = damp(this.lCur.p.y, L.p.y, 16, dt);
    this.lCur.p.z = damp(this.lCur.p.z, L.p.z, 16, dt);
    this.lCur.r.x = damp(this.lCur.r.x, L.r.x, 16, dt);
    this.lCur.r.y = damp(this.lCur.r.y, L.r.y, 16, dt);
    this.lCur.r.z = damp(this.lCur.r.z, L.r.z, 16, dt);
    this.lGroup.position.copy(this.lCur.p);
    this.lGroup.rotation.set(this.lCur.r.x, this.lCur.r.y, this.lCur.r.z);
    this.lGroup.visible = this.lCur.p.y > -0.55;
    this.prop.visible = propVis;

    // scope view hides the model
    this.root.visible = !(this.id === 'rifle' && s.ads > 0.92);
    if (this.cls === 'fists') {
      this.rHand.rotation.x = 0.3;
    }
  }

  render(renderer) {
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
  }
}

