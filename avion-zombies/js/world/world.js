import * as THREE from '../../vendor/three.module.min.js';
import { buildTextures, makeSign } from './textures.js';
import { buildMaterials, std } from './materials.js';
import { Terrain } from './terrain.js';
import { Sky } from './sky.js';
import { Builder, boxGeometry } from './builder.js';
import { buildVegetation } from './vegetation.js';
import { fogGLSL } from './fog.js';
import { PhysicsWorld } from '../engine/physics.js';
import { NavGrid } from '../engine/nav.js';
import * as MAP from './map_rainshadow.js';
import { rand, clamp, makeRng } from '../util.js';
import { audio } from '../engine/audio.js';

// --- Static additive glow billboards (lamp halos, beacons) -------------------------------
const glowVert = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iColor;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vViewPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
  mv.xy += position.xy * iColor.a;
  vViewPos = mv.xyz;
  vUv = position.xy + 0.5;
  vColor = iColor;
  gl_Position = projectionMatrix * mv;
}
`;
const glowFrag = /* glsl */ `
uniform sampler2D uTex;
varying vec2 vUv;
varying vec4 vColor;
varying vec3 vViewPos;
${fogGLSL.pars}
${fogGLSL.func}
void main() {
  // halos read as atmosphere at a distance; up close they fade so lamps don't white out the view
  float near = smoothstep(2.0, 14.0, length(vViewPos));
  float a = texture2D(uTex, vUv).a * (0.15 + 0.85 * near);
  vec3 fc;
  float f = worldFog(vViewPos, fc);
  gl_FragColor = vec4(vColor.rgb * a * 0.55 * (1.0 - f * 0.85), a);
}
`;

class GlowSet {
  constructor(list, texture, scene) {
    this.list = list;
    const N = Math.max(1, list.length);
    const geo = new THREE.InstancedBufferGeometry();
    const quad = new THREE.PlaneGeometry(1, 1);
    geo.index = quad.index;
    geo.setAttribute('position', quad.attributes.position);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    this.aColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4).setUsage(THREE.DynamicDrawUsage);
    list.forEach((g, i) => this.aPos.setXYZ(i, g.x, g.y, g.z));
    geo.setAttribute('iPos', this.aPos);
    geo.setAttribute('iColor', this.aColor);
    geo.instanceCount = list.length;
    const mat = new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: glowFrag, transparent: true, depthWrite: false, fog: true,
      uniforms: { uTex: { value: texture }, ...fogGLSL.uniforms() },
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 25;
    scene.add(this.mesh);
    this.c = new THREE.Color();
  }
  set(i, color, intensity, size) {
    this.aColor.setXYZW(i, color.r * intensity, color.g * intensity, color.b * intensity, size);
    this.aColor.needsUpdate = true;
  }
}

// --- Fake volumetric floodlight beams -----------------------------------------------------
const beamVert = /* glsl */ `
varying float vT;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  vT = -position.y;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv.xyz;
  vNormalV = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}
`;
const beamFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uIntensity;
uniform float uTime;
varying float vT;
varying vec3 vNormalV;
varying vec3 vViewPos;
void main() {
  float fres = abs(dot(normalize(vNormalV), normalize(-vViewPos)));
  float along = clamp(vT, 0.0, 1.0);
  float a = pow(fres, 2.2) * (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.08, along);
  a *= 0.85 + 0.15 * sin(uTime * 0.7 + vT * 9.0);
  gl_FragColor = vec4(uColor * a * uIntensity, a);
}
`;

const DOOR_TIME = { gate: 1.3, blast: 1.5, debris: 1.6 };

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.map = MAP;
    this.time = 0;
    this.power = false;
    this.doors = [];
  }

  // Build everything; reports progress (0..1) through onProgress.
  async build(onProgress = () => {}) {
    const step = async (p) => {
      onProgress(p);
      await new Promise((r) => setTimeout(r, 0));
    };
    const scene = this.scene;
    this.textures = buildTextures();
    await step(0.1);
    this.materials = buildMaterials(this.textures);
    this.terrain = new Terrain({
      minX: -280, minZ: -280, size: 560, res: 2,
      heightFn: MAP.heightFn, colorFn: MAP.terrainColor, walkFn: MAP.walkFn,
    });
    this.terrainMesh = this.terrain.buildMesh(this.textures);
    scene.add(this.terrainMesh);
    await step(0.25);
    this.physics = new PhysicsWorld(this.terrain);
    this.sky = new Sky(scene);
    this.builder = new Builder(scene, this.physics, this.materials);
    const built = MAP.buildRainshadow(this.builder, { terrain: this.terrain, textures: this.textures, materials: this.materials });
    this.fxPoints = built.fx;
    this._buildDoors();
    this.builder.finalize();
    await step(0.45);
    const density = { trees: this.quality.trees, ferns: this.quality.ferns, msaa: this.quality.msaa };
    this.vegetation = buildVegetation({
      scene, terrain: this.terrain, physics: this.physics, materials: this.materials, density,
      map: {
        inPlayable: MAP.inPlayable, treeClearance: MAP.treeClearance, meadowMask: MAP.meadowMask, fernAllowed: MAP.fernAllowed,
        rocks: MAP.ROCKS, logs: MAP.LOGS, extraTrees: MAP.EXTRA_TREES,
      },
    });
    await step(0.7);
    this.nav = new NavGrid({ ...MAP.BOUNDS, cell: 0.5 });
    this.nav.build(this.physics, this.terrain, MAP.zoneAt);
    await step(0.85);
    this._buildFx();
    this._buildLights();
    await step(1);
  }

  // ---------------------------------------------------------------------------------------
  _buildDoors() {
    const B = this.builder;
    const M = this.materials;
    for (const d of MAP.DOORS) {
      const group = new THREE.Group();
      const y = this.terrain.heightAt(d.x, d.z);
      group.position.set(d.x, y, d.z);
      group.rotation.y = d.rot;
      this.scene.add(group);
      const colliders = [];
      const door = { data: d, group, colliders, open: false, t: 0, parts: [], y };
      const addCol = (w, h, dd) => {
        colliders.push(this.physics.addBox({
          x: d.x, y: y - 0.3, z: d.z, w, h: h + 0.3, d: dd, rot: d.rot, walkable: false, material: d.type === 'debris' ? 'wood' : 'metal',
          door: { id: d.id }, bullets: d.type !== 'gate',
        }));
      };
      if (d.type === 'gate') {
        const frame = new THREE.Group();
        const bar = (w, h, dd, x, yy, z, mat) => {
          const m = new THREE.Mesh(boxGeometry(w, h, dd, 2), mat);
          m.position.set(x, yy, z);
          m.castShadow = true;
          frame.add(m);
        };
        bar(d.w, 0.12, 0.12, 0, d.h - 0.1, 0, M.steelDark);
        bar(d.w, 0.12, 0.12, 0, 0.15, 0, M.steelDark);
        bar(0.12, d.h, 0.12, -d.w / 2, d.h / 2, 0, M.steelDark);
        bar(0.12, d.h, 0.12, d.w / 2, d.h / 2, 0, M.steelDark);
        bar(d.w, 0.08, 0.08, 0, d.h / 2, 0, M.hazard);
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(d.w, d.h - 0.2), M.chainlink);
        mesh.position.set(0, d.h / 2, 0);
        frame.add(mesh);
        const sign = makeSign([{ text: 'RESTRICTED', size: 60 }, { text: 'AVION SECURITY', size: 34, weight: 600 }], { w: 256, h: 128 });
        const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), std({ map: sign, roughness: 0.7, side: THREE.DoubleSide }));
        sm.position.set(0, 1.6, 0.08);
        frame.add(sm);
        group.add(frame);
        door.parts.push({ obj: frame, kind: 'slide', amount: d.w * 0.95 });
        addCol(d.w, d.h, 0.3);
      } else if (d.type === 'blast') {
        const panel = new THREE.Mesh(boxGeometry(d.w, d.h, 0.3, 2), M.steelDark);
        panel.position.set(0, d.h / 2, 0);
        panel.castShadow = true;
        const stripe = new THREE.Mesh(boxGeometry(d.w, 0.35, 0.32, 2), M.hazard);
        stripe.position.set(0, -d.h / 2 + 0.25, 0);
        panel.add(stripe);
        const emb = makeSign([{ text: 'SEALED', size: 64 }, { text: d.label.toUpperCase(), size: 30, weight: 600 }], { w: 256, h: 128 });
        for (const side of [-1, 1]) {
          const sm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), std({ map: emb, roughness: 0.7 }));
          sm.position.set(0, 0.3, side * 0.16);
          if (side < 0) sm.rotation.y = Math.PI;
          panel.add(sm);
        }
        group.add(panel);
        door.parts.push({ obj: panel, kind: 'lift', amount: d.h - 0.2 });
        addCol(d.w, d.h, 0.4);
      } else {
        const rng = makeRng(d.id * 99);
        for (let k = 0; k < 5; k++) {
          const len = d.w * (0.8 + rng() * 0.4);
          const r = 0.3 + rng() * 0.25;
          const log = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, len, 9), M.log);
          log.rotation.z = Math.PI / 2;
          log.rotation.y = (rng() - 0.5) * 0.5;
          log.position.set((rng() - 0.5) * 1.2, r + (k > 2 ? 0.9 : 0) + (k > 3 ? 0.6 : 0), (rng() - 0.5) * 1.8);
          log.castShadow = true;
          group.add(log);
          door.parts.push({ obj: log, kind: 'debris', vx: (rng() - 0.5) * 2, vy: 2 + rng() * 2, vz: (rng() - 0.5) * 4 });
        }
        addCol(d.w, d.h, 2.4);
      }
      for (const p of door.parts) {
        p.home = p.obj.position.clone();
        p.homeRot = p.obj.rotation.clone();
      }
      this.doors.push(door);
    }
  }

  openDoor(door, instant = false) {
    if (door.open) return;
    door.open = true;
    door.t = instant ? 10 : 0;
    for (const c of door.colliders) c.disabled = true;
    this.nav.openDoor(door.data.id);
    const p = new THREE.Vector3(door.data.x, door.y + 1.4, door.data.z);
    if (!instant) audio.play3D(door.data.type === 'debris' ? 'debris' : 'door_open', p, { volume: 1.2, refDistance: 6 });
  }

  resetDoors() {
    for (const door of this.doors) {
      door.open = false;
      door.t = 0;
      for (const c of door.colliders) c.disabled = false;
      for (const p of door.parts) {
        p.obj.position.copy(p.home);
        p.obj.rotation.copy(p.homeRot);
        p.obj.visible = true;
        p.obj.scale.set(1, 1, 1);
      }
    }
    this.nav.resetDoors();
  }

  _updateDoors(dt) {
    for (const door of this.doors) {
      if (!door.open || door.t > DOOR_TIME[door.data.type] + 1) continue;
      door.t += dt;
      const T = DOOR_TIME[door.data.type];
      const k = clamp(door.t / T, 0, 1);
      const e = k * k * (3 - 2 * k);
      for (const p of door.parts) {
        if (p.kind === 'slide') p.obj.position.x = p.home.x + p.amount * e;
        else if (p.kind === 'lift') p.obj.position.y = p.home.y + p.amount * e;
        else {
          const t = door.t;
          p.obj.position.set(p.home.x + p.vx * t, p.home.y + p.vy * t - 4.9 * t * t, p.home.z + p.vz * t);
          p.obj.rotation.x = p.homeRot.x + t * p.vz;
          const s = clamp(1 - (t - 0.7) / 0.9, 0, 1);
          p.obj.scale.setScalar(Math.max(0.001, s));
          if (s <= 0) p.obj.visible = false;
        }
      }
      if (door.data.type === 'debris' && door.t < 0.9 && this.particles && Math.random() < 0.5) {
        this.particles.dust(door.data.x + rand(-3, 3), door.y + rand(0.2, 1.5), door.data.z + rand(-1, 1), 0, 1, 0, [0.4, 0.34, 0.28], 2, 2);
      }
    }
  }

  // ---------------------------------------------------------------------------------------
  _buildFx() {
    const B = this.builder;
    const glowList = B.glows.map((g) => ({ ...g, color: new THREE.Color(g.color) }));
    this.beaconStart = glowList.length;
    for (const b of this.fxPoints.beacons) {
      glowList.push({ x: b.x, y: b.y, z: b.z, size: b.big ? 5 : 2.2, color: new THREE.Color(b.color), beacon: b });
      const m = new THREE.Mesh(new THREE.SphereGeometry(b.big ? 0.35 : 0.14, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color).multiplyScalar(6) }));
      m.position.set(b.x, b.y, b.z);
      this.scene.add(m);
      b.mesh = m;
    }
    this.glowList = glowList;
    this.glows = new GlowSet(glowList, this.textures.glow, this.scene);
    glowList.forEach((g, i) => this.glows.set(i, g.color, g.anchor && g.anchor.needsPower ? 0 : 1.2, g.size));

    // floodlight beams
    this.beams = [];
    for (const b of B.beams) {
      const geo = new THREE.CylinderGeometry(0.25, b.radius, b.length, 24, 1, true);
      geo.translate(0, -b.length / 2, 0);
      // vT runs 0..1 down the cone
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) / b.length);
      const mat = new THREE.ShaderMaterial({
        vertexShader: beamVert, fragmentShader: beamFrag, transparent: true, depthWrite: false, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color(b.color) }, uIntensity: { value: 0 }, uTime: { value: 0 } },
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.scale.set(1, b.length, 1);
      mesh.position.set(b.x, b.y, b.z);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), b.dir);
      mesh.renderOrder = 30;
      mesh.visible = false;
      this.scene.add(mesh);
      this.beams.push({ mesh, data: b });
    }

    // blinking server LEDs
    const ledCanvas = document.createElement('canvas');
    ledCanvas.width = 64;
    ledCanvas.height = 128;
    const lc = ledCanvas.getContext('2d');
    lc.fillStyle = '#05090b';
    lc.fillRect(0, 0, 64, 128);
    const rng = makeRng(8);
    for (let y = 4; y < 128; y += 8) {
      for (let x = 4; x < 64; x += 8) {
        if (rng() < 0.45) continue;
        lc.fillStyle = rng() < 0.7 ? '#3cff9a' : rng() < 0.5 ? '#ffb030' : '#3aa0ff';
        lc.fillRect(x, y, 3, 2);
      }
    }
    const ledTex = new THREE.CanvasTexture(ledCanvas);
    ledTex.colorSpace = THREE.SRGBColorSpace;
    ledTex.wrapT = THREE.RepeatWrapping;
    this.ledTex = ledTex;
    const ledMat = new THREE.MeshBasicMaterial({ map: ledTex, color: new THREE.Color(2.4, 2.4, 2.4) });
    const screenCanvas = document.createElement('canvas');
    screenCanvas.width = 256;
    screenCanvas.height = 160;
    const sc = screenCanvas.getContext('2d');
    sc.fillStyle = '#04121a';
    sc.fillRect(0, 0, 256, 160);
    sc.strokeStyle = '#46d2ff';
    sc.lineWidth = 2;
    sc.beginPath();
    for (let x = 0; x < 256; x += 4) sc.lineTo(x, 80 + Math.sin(x * 0.08) * 30 * Math.sin(x * 0.013));
    sc.stroke();
    sc.fillStyle = '#46d2ff';
    sc.font = '18px monospace';
    sc.fillText('EXO-SUBJ 0417  ▲ VITALS ERR', 8, 22);
    sc.fillText('NEURAL SYNC: 0.00%', 8, 150);
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screenMat = new THREE.MeshBasicMaterial({ map: screenTex, color: new THREE.Color(1.8, 1.8, 1.8) });
    for (const s of this.fxPoints.screens) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.rack ? 0.9 : 0.9, s.rack ? 1.8 : 0.55), s.rack ? ledMat : screenMat);
      m.position.set(s.x, s.y, s.z);
      m.rotation.y = s.rot;
      if (!s.rack) m.rotation.x = -0.2;
      this.scene.add(m);
    }
    this.fireTimers = this.fxPoints.fires.map(() => 0);
  }

  _buildLights() {
    const n = this.quality.lights;
    this.lightPool = [];
    for (let i = 0; i < n; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 10, 2);
      l.castShadow = false;
      this.scene.add(l);
      this.lightPool.push({ light: l, anchor: null });
    }
    // event lights: muzzle flash + explosions
    this.flashLight = new THREE.PointLight(0xffb070, 0, 9, 2);
    this.scene.add(this.flashLight);
    this.boomLight = new THREE.PointLight(0xff8a40, 0, 22, 2);
    this.scene.add(this.boomLight);
    this.boomT = 0;
    this.lightTimer = 0;
  }

  anchorActive(a) {
    if (a.needsPower && !this.power) return false;
    return a.intensity > 0;
  }

  setPower(on) {
    this.power = on;
    this.glowList.forEach((g, i) => {
      if (g.anchor && g.anchor.needsPower) this.glows.set(i, g.color, on ? 1.4 : 0, g.size);
      if (g.anchor) g.anchor.mesh.visible = !g.anchor.needsPower || on || true;
    });
    for (const a of this.builder.lightAnchors) {
      if (a.needsPower) a.mat.color.copy(a.baseColor).multiplyScalar(on ? 1 : 0.04);
    }
    for (const b of this.beams) b.mesh.visible = on;
    this.lightTimer = 0;
  }

  muzzleFlash(pos, strength = 1) {
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 14 * strength;
    this.flashT = 0.05;
  }

  boom(pos, strength = 1) {
    this.boomLight.position.copy(pos);
    this.boomLight.position.y += 1;
    this.boomLight.intensity = 90 * strength;
    this.boomT = 0.45;
  }

  update(dt, camPos, playerPos) {
    this.time += dt;
    const t = this.time;
    this._updateDoors(dt);
    // dynamic light pool: nearest active anchors to the player
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) {
      this.lightTimer = 0.3;
      const anchors = this.builder.lightAnchors.filter((a) => this.anchorActive(a));
      anchors.sort((a, b) => ((a.x - camPos.x) ** 2 + (a.z - camPos.z) ** 2) - ((b.x - camPos.x) ** 2 + (b.z - camPos.z) ** 2));
      this.lightPool.forEach((slot, i) => {
        slot.anchor = anchors[i] || null;
        if (slot.anchor) {
          slot.light.position.set(slot.anchor.x, slot.anchor.y, slot.anchor.z);
          slot.light.color.copy(slot.anchor.color);
          slot.light.distance = slot.anchor.distance;
        }
      });
    }
    for (const slot of this.lightPool) {
      const a = slot.anchor;
      if (!a) {
        slot.light.intensity = 0;
        continue;
      }
      let k = 1;
      if (a.flicker) {
        const f = Math.sin(t * 13.1 + a.x) * Math.sin(t * 7.3 + a.z * 1.7) + Math.sin(t * 31 + a.x * 3);
        k = f > 1.2 - a.flicker ? 0.25 : 1 - a.flicker * 0.25 * Math.random();
        a.mat.color.copy(a.baseColor).multiplyScalar(k);
      }
      // lamps sit high under ceilings: give them enough punch to light the floor
      const dim = a.zone === 2 && !this.power ? 0.6 : 1;
      slot.light.intensity = a.intensity * k * dim * 2.6;
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) this.flashLight.intensity = 0;
    }
    if (this.boomT > 0) {
      this.boomT -= dt;
      this.boomLight.intensity = Math.max(0, this.boomT / 0.45) ** 2 * 90;
    }
    // beacons: rotating/blinking
    for (let i = this.beaconStart; i < this.glowList.length; i++) {
      const g = this.glowList[i];
      const b = g.beacon;
      let k;
      if (b.always) k = (Math.sin(t * 2.4) > 0.3 ? 1.6 : 0.15);
      else if (this.power) k = 0;
      else k = Math.max(0, Math.sin(t * 5 + i)) ** 3 * 1.8;
      this.glows.set(i, g.color, k, g.size);
      b.mesh.visible = k > 0.05;
    }
    // flickering lamp halos follow their anchor
    this.glowList.forEach((g, i) => {
      if (g.anchor && g.anchor.flicker && (!g.anchor.needsPower || this.power)) {
        const k = g.anchor.mat.color.r / Math.max(0.001, g.anchor.baseColor.r);
        this.glows.set(i, g.color, 1.2 * k, g.size);
      }
    });
    for (const b of this.beams) {
      b.mesh.material.uniforms.uTime.value = t;
      b.mesh.material.uniforms.uIntensity.value = b.data.intensity;
    }
    if (this.ledTex) this.ledTex.offset.y = Math.floor(t * 3) * 0.0625;
    // fires, smoke, cryo bubbles
    if (this.particles) {
      const P = this.particles;
      this.fxPoints.fires.forEach((f, i) => {
        this.fireTimers[i] -= dt;
        while (this.fireTimers[i] <= 0) {
          this.fireTimers[i] += 0.035 / f.size;
          P.add.spawn({
            x: f.x + rand(-0.3, 0.3) * f.size, y: f.y, z: f.z + rand(-0.3, 0.3) * f.size, vx: rand(-0.2, 0.2), vy: rand(1.2, 2.4) * f.size, vz: rand(-0.2, 0.2),
            life: rand(0.4, 0.8), size: 0.35 * f.size, size1: 0.05, r: 4.2, g: 1.6, b: 0.4, a: 0.9, a1: 0, cell: 1, rotV: rand(-2, 2),
          });
          if (Math.random() < 0.15) {
            P.add.spawn({
              x: f.x, y: f.y + 0.4, z: f.z, vx: rand(-0.6, 0.6), vy: rand(1.5, 3.5), vz: rand(-0.6, 0.6), life: rand(1, 2.2), size: 0.02,
              r: 6, g: 2.4, b: 0.6, a: 1, a1: 0, drag: 0.6, cell: 0,
            });
          }
        }
      });
      if (Math.random() < dt * 6) {
        for (const s of this.fxPoints.smoke) {
          P.alpha.spawn({
            x: s.x + rand(-0.3, 0.3), y: s.y, z: s.z + rand(-0.3, 0.3), vx: rand(0.2, 0.8), vy: rand(1.0, 1.8), vz: rand(-0.3, 0.3),
            life: rand(4, 7), size: 0.6, size1: rand(3.5, 6), r: 0.1, g: 0.095, b: 0.1, a: 0.45, a1: 0, drag: 0.15, cell: 1, rotV: rand(-0.3, 0.3),
          });
        }
      }
      if (Math.random() < dt * 8) {
        const c = this.fxPoints.cryo[Math.floor(Math.random() * this.fxPoints.cryo.length)];
        if (c && (c.x - camPos.x) ** 2 + (c.z - camPos.z) ** 2 < 900) {
          P.add.spawn({ x: c.x + rand(-0.35, 0.35), y: c.y, z: c.z + rand(-0.35, 0.35), vy: rand(0.5, 1.0), life: 2.2, size: 0.03, r: 0.4, g: 2.2, b: 1.6, a: 0.8, a1: 0, cell: 0 });
        }
      }
      // ground mist + dust motes around the player
      this._mistTimer = (this._mistTimer || 0) - dt;
      if (this._mistTimer <= 0 && playerPos) {
        this._mistTimer = this.quality.post ? 0.12 : 0.3;
        const a = Math.random() * Math.PI * 2;
        const r = rand(6, 38);
        const x = playerPos.x + Math.cos(a) * r;
        const z = playerPos.z + Math.sin(a) * r;
        const y = this.terrain.heightAt(x, z);
        const fc = this.scene.fog.color;
        P.alpha.spawn({
          x, y: y + rand(0.3, 1.5), z, vx: rand(0.2, 0.6), vy: 0.02, vz: rand(-0.2, 0.2), life: rand(7, 11),
          size: rand(3, 5), size1: rand(6, 9), r: fc.r * 1.1, g: fc.g * 1.1, b: fc.b * 1.15, a: 0.1, a1: 0, cell: 1, rotV: rand(-0.05, 0.05),
        });
        if (Math.random() < 0.6) {
          P.add.spawn({
            x: camPos.x + rand(-5, 5), y: camPos.y + rand(-1.5, 2.5), z: camPos.z + rand(-5, 5), vx: rand(-0.1, 0.1), vy: rand(-0.05, 0.08), vz: rand(-0.1, 0.1),
            life: rand(3, 6), size: 0.012, r: 1.2, g: 1.0, b: 0.8, a: 0.7, a1: 0, cell: 0,
          });
        }
      }
    }
  }

  zoneAt(x, z) {
    return MAP.zoneAt(x, z) - 1;
  }
}
