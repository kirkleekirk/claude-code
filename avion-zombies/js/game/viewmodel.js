import * as THREE from '../../vendor/three.module.min.js';
import { buildGun, setCamo, gunMaterials, rbox } from './gunmodels.js';
import { clamp, lerp, smoothstep, rand } from '../util.js';
import { mergeGeometries } from '../world/materials.js';

// First-person weapon + arms, rendered in its own scene after the world (no wall clipping).

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.translate(64, 64);
  for (let k = 0; k < 7; k++) {
    ctx.rotate((Math.PI * 2) / 7 + Math.random() * 0.2);
    const g = ctx.createLinearGradient(0, 0, 0, 60);
    g.addColorStop(0, 'rgba(255,240,200,1)');
    g.addColorStop(1, 'rgba(255,140,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-7, 0);
    ctx.lineTo(0, 58 * (0.6 + Math.random() * 0.4));
    ctx.lineTo(7, 0);
    ctx.fill();
  }
  const r = ctx.createRadialGradient(0, 0, 0, 0, 0, 30);
  r.addColorStop(0, 'rgba(255,255,230,1)');
  r.addColorStop(1, 'rgba(255,170,60,0)');
  ctx.fillStyle = r;
  ctx.fillRect(-64, -64, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Collects a hand's pieces and merges them into one mesh per material (two draw calls a hand).
function handParts(group) {
  const lists = new Map();
  const o = new THREE.Object3D();
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => {
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, rz);
    o.updateMatrix();
    if (!lists.has(mat)) lists.set(mat, []);
    lists.get(mat).push({ geometry: geo, matrix: o.matrix.clone() });
  };
  add.done = () => {
    for (const [mat, list] of lists) {
      group.add(new THREE.Mesh(mergeGeometries(list), mat));
      for (const p of list) p.geometry.dispose();
    }
  };
  return add;
}

// Gloved hand wrapped around a pistol grip. Local frame: grip axis along -Y, front of the grip
// toward -Z, palm of the right hand on +X. Returns the wrist point the forearm attaches to.
function fistHand(group, mats) {
  const add = handParts(group);
  const hw = 0.015;
  const hd = 0.021;
  add(rbox(0.022, 0.072, 0.066, 0.008), mats.glove, hw + 0.0095, -0.004, 0.004);
  add(rbox(0.044, 0.062, 0.022, 0.009), mats.glove, 0.007, -0.008, hd + 0.008);
  add(rbox(0.04, 0.022, 0.034, 0.008), mats.glove, 0.006, 0.03, hd - 0.002);
  for (let i = 0; i < 3; i++) {
    const y = 0.006 - i * 0.0185;
    add(rbox(0.05, 0.0175, 0.02, 0.0075), mats.glove, 0.003, y, -hd - 0.008);
    add(rbox(0.014, 0.0165, 0.026, 0.006), mats.glove, -hw - 0.005, y, -hd + 0.006);
    add(rbox(0.012, 0.012, 0.012, 0.004), mats.knuckle, hw + 0.017, y + 0.001, -hd + 0.002);
  }
  add(rbox(0.016, 0.016, 0.04, 0.007), mats.glove, hw + 0.004, 0.028, -hd - 0.012, 0, 0.25, 0);
  add(rbox(0.017, 0.018, 0.048, 0.0075), mats.glove, -hw - 0.006, 0.03, -0.004, 0.25, 0, 0);
  add(rbox(0.05, 0.048, 0.034, 0.012), mats.glove, hw * 0.6, -0.016, hd + 0.03);
  add.done();
  return new THREE.Vector3(hw * 0.6, -0.02, hd + 0.05);
}

// Support hand cupping a handguard of radius r from below. Local frame: handguard along -Z,
// the thumb on -X and the fingers curling up the far (+X) side.
function cupHand(group, mats, r) {
  const add = handParts(group);
  add(rbox(0.06, 0.022, 0.08, 0.009), mats.glove, 0.004, -r - 0.009, 0, 0, 0, 0.12);
  add(rbox(0.024, 0.032, 0.044, 0.009), mats.glove, -r - 0.005, -r * 0.55, 0.014);
  add(rbox(0.017, 0.018, 0.058, 0.0075), mats.glove, -r - 0.007, -r * 0.1, -0.018);
  for (let i = 0; i < 4; i++) {
    const z = -0.03 + i * 0.0185;
    add(rbox(0.017, 0.034, 0.0165, 0.0065), mats.glove, r + 0.007, -r * 0.2, z, 0, 0, -0.12);
    add(rbox(0.016, 0.014, 0.015, 0.0055), mats.glove, r * 0.62, r * 0.72, z, 0, 0, -0.75);
    add(rbox(0.01, 0.012, 0.011, 0.004), mats.knuckle, r + 0.016, -r * 0.35, z);
  }
  add(rbox(0.05, 0.044, 0.034, 0.012), mats.glove, -0.008, -r - 0.024, 0.044);
  add.done();
  return new THREE.Vector3(-0.01, -r - 0.03, 0.06);
}

export class ViewModel {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.01, 20);
    this.hemi = new THREE.HemisphereLight(0x9f8fc8, 0x3a3226, 1.2);
    this.dir = new THREE.DirectionalLight(0xffc090, 1.6);
    this.scene.add(this.hemi, this.dir, this.dir.target);
    // soft camera-side fill so the weapon always reads, even backlit by the sunset
    this.fill = new THREE.DirectionalLight(0xc8d0e8, 1.4);
    this.fill.position.set(-0.6, 0.5, 1);
    this.scene.add(this.fill);
    this.flash = new THREE.PointLight(0xffb070, 0, 3, 2);
    this.scene.add(this.flash);
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.guns = new Map();
    this.gun = null;
    this.stats = null;

    // environment reflections for the metal parts
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envScene = new THREE.Scene();
    const envGeo = new THREE.SphereGeometry(10, 32, 16);
    const cols = [];
    const p = envGeo.attributes.position;
    for (let i = 0; i < p.count; i++) cols.push(1, 1, 1);
    envGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    this.envMesh = new THREE.Mesh(envGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide }));
    this.envScene.add(this.envMesh);
    this.envTarget = null;

    // arms: sleeves from off-screen elbows to gloved hands that live on the gun
    const M = gunMaterials();
    this.sleeveMat = new THREE.MeshStandardMaterial({ color: 0x3c4233, roughness: 0.95 });
    this.gloveMat = new THREE.MeshStandardMaterial({ color: 0x2f3134, roughness: 0.85 });
    this.knuckleMat = new THREE.MeshStandardMaterial({ color: 0x44474a, roughness: 0.7 });
    this.exoMat = new THREE.MeshStandardMaterial({ color: 0x6b737c, metalness: 0.8, roughness: 0.35 });
    this.exoGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.4, 4.0) });
    const sleeveGeo = new THREE.CylinderGeometry(0.034, 0.048, 1, 14, 1);
    sleeveGeo.translate(0, 0.5, 0);
    const cuffGeo = new THREE.CylinderGeometry(0.0375, 0.0365, 0.05, 14);
    const rollGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14);
    this.arms = ['L', 'R'].map((side) => {
      const forearm = new THREE.Group();
      const sleeve = new THREE.Mesh(sleeveGeo, this.sleeveMat);
      const cuff = new THREE.Mesh(cuffGeo, this.gloveMat);
      const roll = new THREE.Mesh(rollGeo, this.sleeveMat);
      forearm.add(sleeve, cuff, roll);
      const exo = new THREE.Group();
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.3, 0.014), this.exoMat);
      strut.position.set(0.042, 0, 0.0);
      const strut2 = strut.clone();
      strut2.position.set(-0.042, 0, 0.0);
      const plate = new THREE.Mesh(rbox(0.05, 0.16, 0.02, 0.006), this.exoMat);
      plate.position.set(0, 0.02, 0.044);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.12, 0.004), this.exoGlow);
      glow.position.set(0, 0.02, 0.055);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.05, 14), this.exoMat);
      band.position.y = 0.13;
      exo.add(strut, strut2, plate, glow, band);
      forearm.add(exo);
      this.root.add(forearm);
      return { forearm, sleeve, cuff, roll, exo, side };
    });
    this.exoVisible = false;
    this.setExo(false);

    // muzzle flash
    const ft = flashTexture();
    const fm = new THREE.MeshBasicMaterial({ map: ft, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(3, 2.4, 1.6) });
    this.flashGroup = new THREE.Group();
    const p1 = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), fm);
    const p2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.09), fm);
    p2.rotation.y = Math.PI / 2;
    const p3 = p2.clone();
    p3.rotation.set(Math.PI / 2, 0, Math.PI / 2);
    this.flashGroup.add(p1, p2, p3);
    this.flashGroup.visible = false;
    this.flashT = 0;

    // ejected brass
    this.shells = [];
    const sg = new THREE.CylinderGeometry(0.005, 0.005, 0.024, 6);
    sg.rotateZ(Math.PI / 2);
    for (let i = 0; i < 18; i++) {
      const m = new THREE.Mesh(sg, M.brass);
      m.visible = false;
      this.root.add(m);
      this.shells.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0 });
    }
    this.shellIdx = 0;

    // animation state
    this.ads = 0;
    this.sprint = 0;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.sway = new THREE.Vector2();
    this.swayV = new THREE.Vector2();
    this.kick = { z: 0, vz: 0, rx: 0, vrx: 0, ry: 0, vry: 0 };
    this.jolt = { y: 0, vy: 0, x: 0, vx: 0 };
    this.lower = 0; // 0 = raised, 1 = fully lowered (switching)
    this.action = null; // {type, t, dur, data}
    this.time = 0;
    this.tmpV = new THREE.Vector3();
    this.tmpQ = new THREE.Quaternion();
  }

  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  updateEnvironment(sky) {
    const geo = this.envMesh.geometry;
    const p = geo.attributes.position;
    const c = geo.attributes.color;
    const u = sky.uniforms;
    const col = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 10;
      const dx = p.getX(i) / 10;
      const dz = p.getZ(i) / 10;
      const sun = Math.max(0, dx * sky.sunDir.x + dz * sky.sunDir.z + y * sky.sunDir.y);
      if (y > 0) col.copy(u.uHorizon.value).lerp(u.uZenith.value, Math.pow(y, 0.5));
      else col.copy(u.uFog.value).multiplyScalar(0.35);
      col.lerp(u.uGlow.value, Math.pow(sun, 6) * 0.6);
      c.setXYZ(i, col.r, col.g, col.b);
    }
    c.needsUpdate = true;
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = 0.45;
  }

  setExo(on) {
    this.exoVisible = on;
    for (const a of this.arms) a.exo.visible = on;
  }

  setWeapon(stats) {
    if (!stats) {
      // empty hands (weapon handed to the forge)
      if (this.gun) this.pivot.remove(this.gun.group);
      this.gun = null;
      this.stats = null;
      for (const a of this.arms) a.forearm.visible = false;
      return;
    }
    this.stats = stats;
    const key = stats.model;
    let gun = this.guns.get(key);
    if (!gun) {
      gun = buildGun(stats.model);
      this._attachHands(gun);
      this.guns.set(key, gun);
    }
    if (this.gun && this.gun !== gun) this.pivot.remove(this.gun.group);
    this.gun = gun;
    this.pivot.add(gun.group);
    setCamo(gun, stats.level > 0);
    gun.group.add(this.flashGroup);
    this.flashGroup.position.copy(gun.muzzle);
    this.resetParts();
  }

  // Hands are built per gun and parented to it (the support hand rides the pump on a shotgun).
  _attachHands(gun) {
    const mats = { glove: this.gloveMat, knuckle: this.knuckleMat };
    const make = (pose) => {
      const g = new THREE.Group();
      const wrist = pose.type === 'cup' ? cupHand(g, mats, pose.r) : fistHand(g, mats);
      if (pose.type === 'support') g.scale.set(-1.1, 1.1, 1.1);
      else if (pose.mirror) g.scale.x = -1;
      g.position.set(...pose.p);
      if (pose.type !== 'cup') g.rotation.x = -pose.rake;
      const parent = (pose.on && gun[pose.on]) || gun.group;
      parent.add(g);
      g.userData.home = g.position.clone();
      return { g, wrist };
    };
    gun.handRig = { right: make(gun.hands.right), left: make(gun.hands.left) };
  }

  resetParts() {
    const g = this.gun;
    if (!g) return;
    for (const k of ['mag', 'slide', 'bolt', 'pump', 'lever', 'drum']) {
      const o = g[k];
      if (o) {
        o.position.copy(o.userData.home);
        o.rotation.copy(o.userData.homeRot);
        o.visible = true;
      }
    }
  }

  play(type, dur, data = {}) {
    this.action = { type, t: 0, dur: Math.max(0.01, dur), data };
  }

  cancelAction() {
    this.action = null;
    this.resetParts();
  }

  onFire(recoil, upgraded) {
    const k = this.kick;
    const adsK = 1 - this.ads * 0.55;
    k.vz += 0.9 * recoil * adsK;
    k.vrx += 2.6 * recoil * adsK;
    k.vry += (Math.random() - 0.5) * 1.2 * recoil;
    this.flashT = 0.05;
    this.flashGroup.visible = true;
    this.flashGroup.rotation.z = Math.random() * Math.PI;
    const s = 0.7 + Math.random() * 0.6;
    this.flashGroup.scale.setScalar(s * (this.stats && this.stats.cls === 'PISTOL' ? 0.7 : 1));
    for (const m of this.flashGroup.children) m.material.color.setRGB(upgraded ? 3.4 : 3, upgraded ? 1.6 : 2.4, upgraded ? 3 : 1.6);
    this.flash.intensity = 4;
    const g = this.gun;
    if (g && g.slide) this.slideT = 0.08;
    if (g && g.eject) this.ejectShell();
  }

  ejectShell() {
    const sh = this.shells[this.shellIdx++ % this.shells.length];
    const g = this.gun;
    sh.m.position.copy(g.eject);
    g.group.localToWorld(sh.m.position);
    this.root.worldToLocal(sh.m.position);
    sh.v.set(rand(0.9, 1.5), rand(0.8, 1.4), rand(-0.1, 0.3));
    sh.w.set(rand(-20, 20), rand(-20, 20), rand(-20, 20));
    sh.life = 0.7;
    sh.m.visible = true;
  }

  joltKick(x, y) {
    this.jolt.vx += x;
    this.jolt.vy += y;
  }

  // state: { dt, ads, sprinting, speed, grounded, lookX, lookY, sliding, exo }
  update(s) {
    const dt = s.dt;
    this.time += dt;
    const g = this.gun;
    if (!g) return;
    this.ads = s.ads;
    this.sprint = lerp(this.sprint, s.sprinting ? 1 : 0, 1 - Math.exp(-dt * 10));
    const moveAmt = clamp(s.speed / 6, 0, 1.3) * (s.grounded ? 1 : 0.15);
    this.bobAmt = lerp(this.bobAmt, moveAmt, 1 - Math.exp(-dt * 8));
    this.bobPhase += dt * (5.2 + s.speed * 0.9);

    // sway: lag behind look motion
    this.swayV.x += (-s.lookX * 2.2 - this.sway.x * 90) * dt - this.swayV.x * 12 * dt;
    this.swayV.y += (-s.lookY * 2.2 - this.sway.y * 90) * dt - this.swayV.y * 12 * dt;
    this.sway.x += this.swayV.x;
    this.sway.y += this.swayV.y;
    this.sway.x = clamp(this.sway.x, -0.12, 0.12);
    this.sway.y = clamp(this.sway.y, -0.12, 0.12);

    // recoil springs
    const k = this.kick;
    k.vz += (-k.z * 220 - k.vz * 22) * dt;
    k.z += k.vz * dt;
    k.vrx += (-k.rx * 200 - k.vrx * 20) * dt;
    k.rx += k.vrx * dt;
    k.vry += (-k.ry * 200 - k.vry * 20) * dt;
    k.ry += k.vry * dt;
    const j = this.jolt;
    j.vy += (-j.y * 120 - j.vy * 14) * dt;
    j.y += j.vy * dt;
    j.vx += (-j.x * 120 - j.vx * 14) * dt;
    j.x += j.vx * dt;

    const ads = smoothstep(0, 1, this.ads);
    // hip pose per gun; aiming puts the sight line on the camera axis, the optic a hand's width away
    const hip = new THREE.Vector3(...g.vm.hip);
    const aim = new THREE.Vector3(0, -g.sightY, -g.vm.relief - g.vm.eye);
    const pos = hip.clone().lerp(aim, ads);
    const rot = new THREE.Euler(0.02 * (1 - ads), 0.07 * (1 - ads), 0.05 * (1 - ads));
    const bob = this.bobAmt * (1 - ads * 0.85);
    pos.x += Math.sin(this.bobPhase) * 0.011 * bob + this.sway.x * 0.25 * (1 - ads * 0.7) + j.x;
    pos.y += -Math.abs(Math.cos(this.bobPhase)) * 0.012 * bob + this.sway.y * 0.25 * (1 - ads * 0.7) + j.y;
    pos.y += Math.sin(this.time * 1.6) * 0.0025 * (1 - ads);
    rot.y += this.sway.x * 1.4 * (1 - ads * 0.6) + k.ry * 0.02;
    rot.x += this.sway.y * 1.4 * (1 - ads * 0.6) + k.rx * 0.045;
    rot.z += -this.sway.x * 0.8;
    pos.z += k.z * 0.06;
    // sprint pose
    const sp = this.sprint * (1 - ads);
    pos.x += sp * 0.03;
    pos.y -= sp * 0.06;
    rot.y += sp * 0.7;
    rot.x += -sp * 0.32 + Math.sin(this.bobPhase) * 0.04 * sp;
    rot.z += sp * 0.32;
    // slide tilt
    if (s.sliding) rot.z -= 0.18;
    // switching
    pos.y -= this.lower * 0.28;
    rot.x -= this.lower * 0.9;

    // timeline actions
    let leftOverride = null;
    this.resetPartsSoft();
    const a = this.action;
    if (a) {
      a.t += dt;
      const t = clamp(a.t / a.dur, 0, 1);
      this._animateAction(a, t, pos, rot, (v) => (leftOverride = v));
      if (a.t >= a.dur) {
        this.action = null;
        this.resetParts();
      }
    }
    // slide blowback
    if (this.slideT > 0 && g.slide) {
      this.slideT -= dt;
      g.slide.position.z = g.slide.userData.home.z + Math.max(0, this.slideT) * 0.4;
    }

    this.pivot.position.copy(pos);
    this.pivot.rotation.copy(rot);
    this.pivot.visible = !((this.stats.scope || g.scope) && this.ads > 0.92);
    for (const arm of this.arms) arm.forearm.visible = this.pivot.visible;
    this.pivot.updateMatrixWorld(true);
    // reflex and holographic reticles only show when looking through the glass
    if (g.reticle) gunMaterials()[g.reticle].opacity = smoothstep(0.55, 0.92, this.ads) * (1 - this.lower);

    // hands live on the gun; the support hand can leave it (reloads, throws, melee)
    const rig = g.handRig;
    const lh = rig.left.g;
    if (leftOverride) lh.position.copy(lh.parent.worldToLocal(leftOverride.clone()));
    else lh.position.copy(lh.userData.home);
    lh.updateMatrixWorld(true);
    const right = rig.right.g.localToWorld(rig.right.wrist.clone());
    const left = lh.localToWorld(rig.left.wrist.clone());
    // elbows sit a forearm's length back from each wrist, toward its shoulder
    this._placeArm(this.arms[1], right, this._elbow(right, new THREE.Vector3(0.2 - ads * 0.08, -0.34, 0.12)));
    this._placeArm(this.arms[0], left, this._elbow(left, new THREE.Vector3(-0.2 + ads * 0.1, -0.36, 0.1)));

    // flash + brass
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashGroup.visible = false;
    }
    this.flash.intensity = Math.max(0, this.flash.intensity - dt * 80);
    this.flash.position.set(pos.x, pos.y + 0.05, pos.z - 0.4);
    for (const sh of this.shells) {
      if (sh.life <= 0) continue;
      sh.life -= dt;
      sh.v.y -= 6 * dt;
      sh.m.position.addScaledVector(sh.v, dt);
      sh.m.rotation.x += sh.w.x * dt;
      sh.m.rotation.y += sh.w.y * dt;
      if (sh.life <= 0) sh.m.visible = false;
    }
    if (gunMaterials().camoTex) {
      const [m, e] = gunMaterials().camoTex;
      m.offset.x = e.offset.x = (this.time * 0.05) % 1;
    }
  }

  resetPartsSoft() {
    const g = this.gun;
    if (!g || this.action) return;
    for (const k of ['bolt', 'pump', 'lever', 'drum']) {
      const o = g[k];
      if (o) {
        o.position.copy(o.userData.home);
        o.rotation.copy(o.userData.homeRot);
      }
    }
  }

  _elbow(hand, shoulder) {
    const d = shoulder.clone().sub(hand);
    const len = d.length();
    const fore = 0.3;
    if (len < fore) return shoulder;
    // drop the elbow a little so the arm bends naturally
    return hand.clone().addScaledVector(d.normalize(), fore).add(new THREE.Vector3(0, -0.06, 0));
  }

  _placeArm(arm, wrist, elbow) {
    const d = this.tmpV.copy(wrist).sub(elbow);
    const len = Math.max(0.05, d.length());
    arm.forearm.position.copy(elbow);
    arm.forearm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    arm.sleeve.scale.set(1, len, 1);
    arm.cuff.position.y = len - 0.012;
    arm.roll.position.y = len - 0.07;
    arm.exo.position.y = len * 0.5;
  }

  // where the support hand normally sits, in viewmodel space
  _leftHome() {
    const lh = this.gun.handRig.left.g;
    return lh.parent.localToWorld(lh.userData.home.clone());
  }

  _animateAction(a, t, pos, rot, setLeft) {
    const g = this.gun;
    const ease = (x) => x * x * (3 - 2 * x);
    const bump = (t0, t1, tt = t) => (tt <= t0 || tt >= t1 ? 0 : Math.sin(((tt - t0) / (t1 - t0)) * Math.PI));
    const win = (t0, t1, tt = t) => clamp((tt - t0) / (t1 - t0), 0, 1);
    switch (a.type) {
      case 'reload': {
        const tilt = bump(0, 1);
        rot.z += tilt * 0.55;
        rot.x += tilt * 0.22;
        pos.y -= tilt * 0.04;
        pos.x -= tilt * 0.03;
        if (g.mag) {
          const out = win(0.12, 0.3);
          const back = win(0.45, 0.68);
          const off = out * (1 - back);
          g.mag.position.y = g.mag.userData.home.y - off * 0.32;
          g.mag.position.z = g.mag.userData.home.z + off * 0.05;
          g.mag.visible = !(out >= 1 && back <= 0.02);
        }
        // left hand fetches the new mag
        const fetch = bump(0.18, 0.7);
        const magW = new THREE.Vector3(0, -0.12 - fetch * 0.2, -0.1).applyMatrix4(g.group.matrixWorld);
        setLeft(this._leftHome().lerp(magW, Math.min(1, fetch * 1.4)));
        if (a.data.empty && t > 0.72 && t < 0.92) {
          const c = bump(0.72, 0.92);
          if (g.slide) g.slide.position.z = g.slide.userData.home.z + c * 0.04;
          rot.z -= c * 0.15;
          pos.x += c * 0.01;
        }
        break;
      }
      case 'shell': {
        // one shell inserted per action
        rot.z += 0.45;
        rot.x += 0.12;
        const push = bump(0.1, 0.8);
        const port = new THREE.Vector3(0.01, -0.02 - (1 - push) * 0.08, -0.05).applyMatrix4(g.group.matrixWorld);
        setLeft(port);
        break;
      }
      case 'revolver': {
        rot.z -= bump(0, 1) * 0.4;
        rot.x += bump(0.1, 0.5) * 0.6;
        if (g.drum) g.drum.position.x = g.drum.userData.home.x - bump(0.05, 0.95) * 0.04;
        setLeft(new THREE.Vector3(-0.02, 0.02, 0.0).applyMatrix4(g.group.matrixWorld));
        break;
      }
      case 'cycle': {
        const c = bump(0.05, 0.95);
        if (g.bolt) {
          g.bolt.rotation.z = -ease(win(0, 0.3)) * 1.1 * (1 - win(0.7, 1));
          g.bolt.position.z = g.bolt.userData.home.z + c * 0.07;
          rot.z += c * 0.18;
        }
        if (g.pump) {
          // the support hand rides the pump
          g.pump.position.z = g.pump.userData.home.z + c * 0.09;
          pos.z += c * 0.02;
        }
        if (g.lever) {
          g.lever.rotation.x = c * 0.9;
          rot.x -= c * 0.08;
        }
        break;
      }
      case 'melee': {
        const swing = bump(0, 1);
        pos.x += swing * 0.12;
        pos.y -= swing * 0.12;
        rot.y += swing * 0.6;
        rot.z -= swing * 0.4;
        const punch = bump(0.08, 0.75);
        setLeft(new THREE.Vector3(-0.05 + punch * 0.05, -0.08 + punch * 0.06, -0.25 - punch * 0.32));
        break;
      }
      case 'throw': {
        const wind = bump(0, 0.45);
        const rel = bump(0.35, 1);
        pos.y -= bump(0, 1) * 0.1;
        rot.x -= bump(0, 1) * 0.3;
        setLeft(new THREE.Vector3(-0.2 + rel * 0.15, -0.05 + wind * 0.15 + rel * 0.05, -0.1 - rel * 0.45 + wind * 0.15));
        break;
      }
      case 'inject': {
        // perk install: raise the wrist module into view (at arm's length, so the forearm
        // does not swallow half the screen)
        const b = bump(0, 1);
        pos.y -= b * 0.15;
        rot.x -= b * 0.5;
        setLeft(new THREE.Vector3(-0.07, -0.2 + b * 0.07, -0.44));
        break;
      }
      default:
        break;
    }
  }
}
