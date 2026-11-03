// Hordes replace the storm. Each horde is a zone where the dead claw up out of the ground
// constantly. Hordes start small, swell when they see survivors or hear loud noise, drift
// toward sound, and big ones can migrate fast across the island.
import * as THREE from 'three';
import { MAX_HORDES, U } from '../world/materials.js';
import { NOISE_GLSL } from '../world/sky.js';
import { clamp, lerp } from '../core/math.js';
import { RNG } from '../core/rng.js';
import { WORLD, POIS, GW, GH } from '../world/layout.js';

let HID = 1;
export class Hordes {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.rng = new RNG(4242);
    this.group = new THREE.Group();
    this.group.name = 'hordes';
    this.heat = new Float32Array(Math.ceil(WORLD.W / 64) * Math.ceil(WORLD.H / 64));
    this.hw = Math.ceil(WORLD.W / 64);
    this.nextNatural = 60;
    this.spawnAcc = new Map();
    this.ambientT = 0;
    this.surge = 0;
    // terrain height texture so the mist hugs the ground
    if (!Hordes.heightTex) {
      const data = new Uint8Array(GW * GH);
      for (let i = 0; i < data.length; i++) data[i] = Math.max(0, Math.min(255, (G.world.height[i] + 10) * 2));
      const t = new THREE.DataTexture(data, GW, GH, THREE.RedFormat, THREE.UnsignedByteType);
      t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
      Hordes.heightTex = t;
    }
    this.mat = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, uNight: { value: 0 }, uColor: { value: new THREE.Color(0x6fbf4a) }, uHeight: { value: null }, uWorldSize: { value: new THREE.Vector2(WORLD.W, WORLD.H) } }]),
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      vertexShader: `varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform float uNight; uniform vec3 uColor; uniform sampler2D uHeight; uniform vec2 uWorldSize; varying vec2 vUv; varying vec3 vW;
        #include <fog_pars_fragment>
        ${NOISE_GLSL}
        void main(){
          float gh = texture2D(uHeight, vW.xz / uWorldSize).r * 127.5 - 10.0;
          float rel = vW.y - gh;
          if (rel < -2.0) discard;
          float h = clamp(rel / 60.0, 0.0, 1.0);
          float n = fbm(vec2(vUv.x * 46.0 + uTime * 0.05, rel * 0.05 - uTime * 0.14));
          float a = (1.0 - smoothstep(0.0, 1.0, h)) * (0.3 + 0.7 * n);
          a *= 0.85 + 0.15 * uNight;
          vec3 col = mix(uColor * 1.15, uColor * 0.5, h) * (0.75 + 0.6 * n);
          col = mix(col, col * vec3(0.5, 0.9, 0.55), uNight);
          gl_FragColor = vec4(col, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.mat.uniforms.uHeight.value = Hordes.heightTex;
    this.cyl = new THREE.CylinderGeometry(1, 1, 1, 96, 1, true);
    this.cyl.translate(0, 0.5, 0);
  }
  get(id) { return this.list.find((h) => h.id === id); }
  create(x, z, r = 40, intensity = 0.5) {
    const h = { id: HID++, x, z, r, tx: x, tz: z, intensity, alert: 0, age: 0, migrating: 0, active: 0, mesh: new THREE.Mesh(this.cyl, this.mat) };
    h.mesh.renderOrder = 2;
    h.mesh.frustumCulled = false;
    this.group.add(h.mesh);
    this.list.push(h);
    this.syncMesh(h);
    this.G.onHordeSpawn?.(h);
    return h;
  }
  remove(h) { this.group.remove(h.mesh); this.list.splice(this.list.indexOf(h), 1); }
  syncMesh(h) { h.mesh.position.set(h.x, -30, h.z); h.mesh.scale.set(h.r, 180, h.r); }
  maxRadius() { const p = this.G.match?.progress || 0; return 90 + p * 600 + this.surge * 350; }
  // returns {inside, depth} for a point
  zoneAt(x, z) {
    let best = null, bd = 1e9;
    for (const h of this.list) {
      const d = Math.hypot(x - h.x, z - h.z) - h.r;
      if (d < bd) { bd = d; best = h; }
    }
    return { horde: best, edge: bd };
  }
  inside(x, z) { for (const h of this.list) if (Math.hypot(x - h.x, z - h.z) < h.r) return h; return null; }

  noise(x, z, radius, src, kind) {
    if (this.G.net?.isClient) return;
    // heat map for natural horde spawns
    const cx = Math.floor(x / 64), cz = Math.floor(z / 64);
    if (cx >= 0 && cz >= 0 && cx < this.hw) { const i = cz * this.hw + cx; if (i < this.heat.length) this.heat[i] += radius; }
    for (const h of this.list) {
      const d = Math.hypot(x - h.x, z - h.z) - h.r;
      if (d > radius * 1.6) continue;
      // drift toward the sound
      h.tx = lerp(h.tx, x, 0.6); h.tz = lerp(h.tz, z, 0.6);
      if (d < radius * 0.6) {
        h.alert = Math.min(10, h.alert + radius / 60);
        h.r = Math.min(this.maxRadius(), h.r + radius * 0.04);
      }
      if (h.r > 160 && radius >= 150) { h.migrating = Math.max(h.migrating, 25); h.tx = x; h.tz = z; }
    }
  }
  onSpotted(zb, s) {
    const h = zb.horde && this.get(zb.horde);
    if (h) { h.alert = Math.min(10, h.alert + 2); h.r = Math.min(this.maxRadius(), h.r + 6); h.tx = lerp(h.tx, s.pos.x, 0.5); h.tz = lerp(h.tz, s.pos.z, 0.5); }
  }
  onZombieKilled(zb) {
    const h = zb.horde && this.get(zb.horde);
    if (h) h.intensity = Math.max(0.2, h.intensity - 0.002);
  }

  naturalSpawn() {
    const G = this.G;
    // prefer noisy places, otherwise a POI, away from the player
    let best = null, bv = -1;
    for (let k = 0; k < 30; k++) {
      let x, z;
      if (this.rng.chance(0.5)) { const p = this.rng.pick(POIS); x = p.x + this.rng.range(-p.r, p.r); z = p.z + this.rng.range(-p.r, p.r); }
      else { x = this.rng.range(300, 3600); z = this.rng.range(300, 2700); }
      if (G.world.coastAt(x, z) < 40) continue;
      const pd = Math.hypot(x - G.player.pos.x, z - G.player.pos.z);
      if (pd < 280 && G.player.alive) continue;
      const i = Math.floor(z / 64) * this.hw + Math.floor(x / 64);
      const v = (this.heat[i] || 0) + this.rng.next() * 200;
      if (v > bv) { bv = v; best = [x, z]; }
    }
    if (best) {
      const h = this.create(best[0], best[1], this.rng.range(35, 60), 0.5);
      G.hud?.announce('A NEW HORDE HAS RISEN', 'green');
      return h;
    }
  }

  update(dt) {
    const G = this.G;
    const m = G.match;
    U.uTime.value = U.uTime.value; // keep shared uniform alive
    this.mat.uniforms.uTime.value += dt;
    this.mat.uniforms.uNight.value = G.env?.night || 0;
    if (G.net?.isClient) { this.updateUniforms(); return; } // the host moves the hordes
    // decay heat
    for (let i = 0; i < this.heat.length; i++) this.heat[i] *= Math.exp(-dt / 240);
    // natural spawns
    this.nextNatural -= dt;
    if (this.nextNatural <= 0 && this.list.length < MAX_HORDES) {
      this.naturalSpawn();
      const base = m?.hordeInterval ?? 300;
      this.nextNatural = base * this.rng.range(0.7, 1.3) * (G.env?.night > 0.5 ? 0.65 : 1);
    }
    const maxR = this.maxRadius();
    const night = G.env?.night || 0;
    for (const h of this.list) {
      h.age += dt;
      // steady growth (this is what slowly squeezes the island)
      const grow = (m?.hordeGrowth ?? 0.18) * (1 + night * 0.8) * (1 + h.alert * 0.15) * (1 + this.surge * 4);
      h.r = Math.min(maxR, h.r + grow * dt);
      h.alert = Math.max(0, h.alert - dt * 0.05);
      h.intensity = clamp(h.intensity + dt * 0.002 * (1 + night), 0.2, 1.6);
      // movement
      const dx = h.tx - h.x, dz = h.tz - h.z;
      const d = Math.hypot(dx, dz);
      let sp = h.r > 220 ? 0.9 : 0.45;
      if (h.migrating > 0) { h.migrating -= dt; sp = h.r > 250 ? 6 : 3.5; }
      if (this.surge > 0) sp *= 1.8;
      if (d > 1) { const k = Math.min(d, sp * dt); h.x += (dx / d) * k; h.z += (dz / d) * k; }
      else if (Math.random() < dt * 0.02) { h.tx = h.x + this.rng.range(-200, 200); h.tz = h.z + this.rng.range(-200, 200); }
      // keep on the island
      h.tx = clamp(h.tx, 200, 3700); h.tz = clamp(h.tz, 200, 2800);
      this.syncMesh(h);
    }
    // merge overlapping hordes
    for (let i = 0; i < this.list.length; i++) for (let j = i + 1; j < this.list.length; j++) {
      const a = this.list[i], b = this.list[j];
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d < Math.max(a.r, b.r) * 0.7) {
        const big = a.r >= b.r ? a : b, small = big === a ? b : a;
        big.r = Math.min(maxR * 1.1, Math.sqrt(big.r * big.r + small.r * small.r));
        big.intensity = Math.max(big.intensity, small.intensity);
        for (const zb of G.zombies.list) if (zb.horde === small.id) zb.horde = big.id;
        this.remove(small);
        G.hud?.announce('TWO HORDES HAVE MERGED', 'green');
        break;
      }
    }
    this.updateUniforms();
    this.spawnZombies(dt);
  }
  // feed shader uniforms (terrain + world tint)
  updateUniforms() {
    const G = this.G;
    const sorted = [...this.list].sort((a, b) => Math.hypot(a.x - G.camera.position.x, a.z - G.camera.position.z) - a.r - (Math.hypot(b.x - G.camera.position.x, b.z - G.camera.position.z) - b.r));
    U.uHordeCount.value = Math.min(MAX_HORDES, sorted.length);
    for (let i = 0; i < MAX_HORDES; i++) {
      const h = sorted[i];
      if (h) U.uHordes.value[i].set(h.x, h.z, h.r, 1); else U.uHordes.value[i].set(0, 0, 0, 0);
    }
  }

  // Spawn the dead around physical survivors that are inside / near hordes, plus ambient wanderers.
  spawnZombies(dt) {
    const G = this.G;
    const Z = G.zombies;
    const night = G.env?.night || 0;
    const survivors = G.survivors.filter((s) => s.alive && s.physical && !s.extracted && (s.isPlayer ? (s.mode === 'ground' || s.mode === 'vault') : s.landed));
    if (!survivors.length) return;
    const cap = Z.max;
    for (const s of survivors) {
      const zone = this.zoneAt(s.pos.x, s.pos.z);
      const h = zone.horde;
      const inside = h && zone.edge < 0;
      const near = h && zone.edge < 70;
      let want = 0;
      if (inside) want = (12 + h.intensity * 18) * (1 + night * 0.4) * (s.isPlayer ? 1 : 0.5);
      else if (near) want = 5 * (1 - zone.edge / 70);
      // ambient
      const amb = (night > 0.5 ? 9 : 4) * (s.isPlayer ? 1 : 0.35) * (G.match?.ambientMul ?? 1);
      // count zombies near this survivor
      let nearCount = 0;
      for (const zb of Z.list) if (zb.state !== 'dead' && Math.abs(zb.pos.x - s.pos.x) < 90 && Math.abs(zb.pos.z - s.pos.z) < 90) nearCount++;
      const key = s.id;
      let acc = (this.spawnAcc.get(key) || 0) + dt;
      const target = Math.min(cap, want + amb);
      const interval = inside ? 0.45 / Math.max(0.3, h.intensity) : 2.2;
      if (nearCount < target && acc > interval && Z.list.length < cap) {
        acc = 0;
        // pick spot
        for (let tries = 0; tries < 6; tries++) {
          const a = Math.random() * Math.PI * 2;
          const r = inside ? 14 + Math.random() * 40 : 45 + Math.random() * 45;
          const x = s.pos.x + Math.cos(a) * r, z = s.pos.z + Math.sin(a) * r;
          if (G.world.isWater(x, z)) continue;
          const occ = G.world.occAt(x, z);
          if (occ & 4) continue; // inside building footprint
          const inH = this.inside(x, z);
          if (!inside && !inH && near) continue;
          // don't pop up right in the player's face in view
          if (s.isPlayer && r < 22 && G.player.inView(x, z) && !inside) continue;
          Z.spawn(x, z, { rise: !!inH || night > 0.5, horde: inH ? inH.id : null, state: inH ? 'wander' : 'wander' });
          break;
        }
      }
      this.spawnAcc.set(key, acc);
    }
  }
}
