import * as THREE from 'three';
import { Geo, M, temp } from '../gfx/geo.js';
import { litMaterial } from '../gfx/materials.js';
import { glyphMaterial, portalMaterial, stoneMat } from './structures.js';
import { crystalCluster } from './models.js';
import { Colliders } from '../core/colliders.js';
import { G, addLight } from '../gfx/globals.js';
import { VAULTS } from './world.js';

const CELL = 4, WALL = 1000, PIT = -7, WALL_H = 9;

// Legend: # wall, . floor, S start, K keystone, D door, m mite, s sentinel, c custodian,
// o low hoop, O high hoop, U very high hoop, Q hoop over a pit, ^ platform, T tall platform,
// _ pit, * light crystal, P pillar.
const MAPS = {
  echoes: {
    tier: 1,
    rows: [
      '###########################',
      '#.....#.........#.........#',
      '#..S..D..m...m..D..o...o..#',
      '#.....#....m....#....o....#',
      '#######....*....#.........#',
      '      ###########....*....#',
      '      ###########D#########',
      '      #.....#.............#',
      '      #..K..#...s.....s...#',
      '      #.....D......*......#',
      '      #..c..#...P.....P...#',
      '      #.....#.............#',
      '      #####################',
    ],
  },
  embers: {
    tier: 2,
    rows: [
      '#########################',
      '#.....#.................#',
      '#..S..D..^...O...^...m..#',
      '#.....#..^..._...^......#',
      '#######......_.......m..#',
      '      #..m..._....*.....#',
      '      #######D###########',
      '      #.................#',
      '      #..s...___...s....#',
      '      #......_Q_........#',
      '      #..*...___....*...#',
      '      #.................#',
      '      ########D##########',
      '      #.....#...#.......#',
      '      #..c..D.*.D...K...#',
      '      #.....#...#...c...#',
      '      ###################',
    ],
  },
  tides: {
    tier: 3,
    rows: [
      '###########################',
      '#.....#...................#',
      '#..S..D...U....._____.....#',
      '#.....#........._____..s..#',
      '#######...U....._Q_Q_.....#',
      '      #........._____..s..#',
      '      #....U..*._____.....#',
      '      #...................#',
      '      ###########D#########',
      '      #...................#',
      '      #..c.....*.....c....#',
      '      #...................#',
      '      #....s.......s......#',
      '      #########D###########',
      '      #.......#.#.........#',
      '      #...U...D.D..s.K.s..#',
      '      #.......#.#.........#',
      '      #####################',
    ],
  },
};

const HOOP_Y = { o: 2.1, O: 4.3, U: 7.2, Q: 3.0 };

export class Vault {
  constructor(game, id) {
    this.game = game; this.id = id; this.type = 'vault';
    this.info = VAULTS[id];
    const map = MAPS[id];
    this.tier = map.tier;
    this.gravity = 19;
    this.sea = -1e9;
    this.flyFloor = 0;
    this.def = { kind: 'vault', name: this.info.name, id };
    const rows = map.rows;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    this.cells = rows.map((r) => r.padEnd(this.w, ' ').split(''));
    this.height = new Float32Array(this.w * this.h);
    this.region = new Int16Array(this.w * this.h).fill(-1);
    this.group = new THREE.Group();
    this.colliders = new Colliders(8);
    this.interactables = [];
    this.lights = [];
    this.doors = []; this.hoops = []; this.spawns = [];
    this.color = new THREE.Color(this.info.color);
    this.cleared = false;
    this.time = 0;
    this.safe = new THREE.Vector3();
    this._build();
  }

  cx(i) { return (i + 0.5) * CELL; }

  _build() {
    const { w, h, cells } = this;
    const c = this.color, gc = [c.r * 1.15, c.g * 1.15, c.b * 1.15];
    const isOpen = (ch) => ch !== '#' && ch !== ' ';
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = cells[z][x];
      let ht = 0;
      if (!isOpen(ch)) ht = WALL; else if (ch === '^') ht = 1.4; else if (ch === 'T') ht = 2.8; else if (ch === '_' || ch === 'Q') ht = PIT; else if (ch === 'D') ht = WALL;
      this.height[z * w + x] = ht;
    }
    // regions separated by doors
    let rid = 0;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      if (!isOpen(cells[z][x]) || cells[z][x] === 'D' || this.region[z * w + x] >= 0) continue;
      const stack = [[x, z]];
      this.region[z * w + x] = rid;
      while (stack.length) {
        const [px, pz] = stack.pop();
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = px + dx, nz = pz + dz;
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const ch = cells[nz][nx];
          if (!isOpen(ch) || ch === 'D' || this.region[nz * w + nx] >= 0) continue;
          this.region[nz * w + nx] = rid;
          stack.push([nx, nz]);
        }
      }
      rid++;
    }
    this.regions = Array.from({ length: rid }, () => ({ enemies: 0, hoops: 0, reached: false }));

    const stone = [0.2, 0.2, 0.26];
    const wallFn = (seed) => (p, n, o) => {
      const v = 0.72 + 0.4 * Math.sin(p.x * 1.3 + p.y * 2.1 + seed) * Math.cos(p.z * 1.7 + p.y * 0.9);
      o[0] = stone[0] * v; o[1] = stone[1] * v; o[2] = stone[2] * v;
      const yy = p.y + WALL_H / 2;
      const band = Math.abs(yy - 2.6) < 0.07 || Math.abs(yy - 6.2) < 0.05;
      const glyph = Math.abs(yy - 4.4) < 0.5 && Math.sin(p.x * 5.3 + seed) * Math.sin(p.z * 5.3 + seed * 2) > 0.55;
      if (band || glyph) { o[0] = gc[0]; o[1] = gc[1]; o[2] = gc[2]; o[3] = band ? 0.9 : 0.5; }
    };
    const g = new Geo();
    // glowing sub-floor shows through the gaps between tiles
    g.add(temp(new THREE.PlaneGeometry(w * CELL, h * CELL).rotateX(-Math.PI / 2)), M.trs(w * CELL / 2, -0.16, h * CELL / 2), (p, n, o) => { o[0] = gc[0] * 0.8; o[1] = gc[1] * 0.8; o[2] = gc[2] * 0.8; o[3] = 0.3; });
    const pitGeo = new Geo();
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      const ch = cells[z][x];
      const wx = this.cx(x), wz = this.cx(z);
      if (!isOpen(ch)) {
        let near = false;
        for (let dz = -1; dz <= 1 && !near; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz;
          if (nx >= 0 && nz >= 0 && nx < w && nz < h && isOpen(cells[nz][nx])) { near = true; break; }
        }
        if (near) {
          g.add(temp(new THREE.BoxGeometry(CELL, WALL_H, CELL, 2, 4, 2)), M.trs(wx, WALL_H / 2 - 0.2, wz), wallFn(x * 3.1 + z * 7.7), true);
          const strip = (y, hh, gl) => g.add(temp(new THREE.BoxGeometry(CELL + 0.08, hh, CELL + 0.08)), M.trs(wx, y, wz), (p, n, o) => { o[0] = gc[0]; o[1] = gc[1]; o[2] = gc[2]; o[3] = gl; }, true);
          strip(2.5, 0.09, 0.8); strip(6.1, 0.06, 0.6);
          g.add(temp(new THREE.BoxGeometry(CELL + 0.3, 0.5, CELL + 0.3)), M.trs(wx, 0.05, wz), (p, n, o) => { o[0] = 0.16; o[1] = 0.16; o[2] = 0.2; }, true);
          if ((x * 7 + z * 13) % 3 === 0) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx < 0 || nz < 0 || nx >= w || nz >= h || !isOpen(cells[nz][nx])) continue;
            g.add(temp(new THREE.BoxGeometry(dx ? 0.06 : 0.5, 1.5, dz ? 0.06 : 0.5)), M.trs(wx + dx * (CELL / 2 + 0.02), 4.3, wz + dz * (CELL / 2 + 0.02)), (p, n, o) => { o[0] = gc[0]; o[1] = gc[1]; o[2] = gc[2]; o[3] = 0.55; }, true);
          }
        }
        continue;
      }
      const ht = this.height[z * w + x];
      if (ch === '_' || ch === 'Q') {
        pitGeo.add(temp(new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2)), M.trs(wx, PIT + 0.3, wz), (p, n, o) => { o[0] = gc[0]; o[1] = gc[1]; o[2] = gc[2]; o[3] = 0.55 + 0.45 * Math.sin(p.x * 2.1) * Math.cos(p.z * 1.7); });
        // pit walls
        for (const [dx, dz, ry] of [[1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, 1, Math.PI], [0, -1, 0]]) {
          const nch = cells[z + dz] && cells[z + dz][x + dx];
          if (nch === '_' || nch === 'Q') continue;
          g.add(temp(new THREE.PlaneGeometry(CELL, -PIT)), M.trs(wx + dx * CELL / 2, PIT / 2, wz + dz * CELL / 2, 0, ry + Math.PI, 0), (p, n, o) => { const v = 0.5 + 0.5 * (p.y / -PIT + 0.5); o[0] = stone[0] * v; o[1] = stone[1] * v; o[2] = stone[2] * v; });
        }
      } else {
        const top = ch === 'D' ? 0 : ht;
        const th = top + 0.3;
        g.add(temp(new THREE.BoxGeometry(CELL - 0.12, th, CELL - 0.12)), M.trs(wx, top - th / 2, wz), (p, n, o) => {
          const v = 0.8 + 0.25 * Math.sin(x * 12.9 + z * 78.2) + (n.y > 0.5 ? 0.1 : -0.15);
          const inlay = n.y > 0.5 && Math.max(Math.abs(p.x), Math.abs(p.z)) > CELL / 2 - 0.3;
          o[0] = 0.15 * v; o[1] = 0.15 * v; o[2] = 0.19 * v;
          if (inlay) { o[0] *= 0.55; o[1] *= 0.55; o[2] *= 0.55; }
          if (top > 0.5 && n.y < 0.5 && Math.abs(p.y - (th / 2 - 0.2)) < 0.05) { o[0] = gc[0]; o[1] = gc[1]; o[2] = gc[2]; o[3] = 0.9; }
        }, true);
      }
      const reg = this.regions[this.region[z * w + x]];
      if (ch === 'S') { this.start = new THREE.Vector3(wx, 0, wz); }
      else if (ch === 'K') this.keyPos = new THREE.Vector3(wx, 0, wz);
      else if (ch === 'm' || ch === 's' || ch === 'c') { this.spawns.push({ type: ch === 'm' ? 'mite' : ch === 's' ? 'sentinel' : 'custodian', x: wx, z: wz, region: this.region[z * w + x] }); reg.enemies++; }
      else if (HOOP_Y[ch] !== undefined) { this.hoops.push({ x: wx, y: (ch === 'Q' ? 0 : ht) + HOOP_Y[ch], z: wz, lit: false, region: this.region[z * w + x], mesh: null, t: 0 }); reg.hoops++; }
      else if (ch === '*') this.lights.push({ x: wx, y: 2.2, z: wz, crystal: true });
      else if (ch === 'P') {
        g.add(temp(new THREE.CylinderGeometry(0.85, 1.0, WALL_H, 8, 5)), M.trs(wx, WALL_H / 2 - 0.2, wz), wallFn(x + z), true);
        this.colliders.addCircle(wx, wz, 1.0, WALL_H, { walk: false });
      } else if (ch === 'D') {
        const horiz = isOpen(cells[z][x - 1] || '#') && isOpen(cells[z][x + 1] || '#');   // passage runs along x
        this.doors.push({ x, z, wx, wz, horiz, open: false, k: 0, mesh: null, regs: horiz ? [this.region[z * w + x - 1], this.region[z * w + x + 1]] : [this.region[(z - 1) * w + x], this.region[(z + 1) * w + x]] });
      }
    }
    const mat = stoneMat();
    mat.uniforms.uMat2.value.x = 1.3;
    this.group.add(new THREE.Mesh(g.build(), mat));
    if (pitGeo.p.length) {
      const pm = litMaterial({ glow: 2.4 });
      this.pitMesh = new THREE.Mesh(pitGeo.build(), pm);
      this.group.add(this.pitMesh);
    }
    // doors
    for (const d of this.doors) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(CELL, 6.4, 0.7), glyphMaterial(this.info.color));
      m.geometry.attributes.uv.needsUpdate = true;
      m.position.set(d.wx, 3.2, d.wz);
      if (d.horiz) m.rotation.y = Math.PI / 2;
      m.material.uniforms.uLocked.value = 1;
      this.group.add(m);
      d.mesh = m;
    }
    // hoops
    const hoopGeo = new THREE.TorusGeometry(1.5, 0.11, 8, 36);
    hoopGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(hoopGeo.attributes.position.count * 3).fill(1), 3));
    hoopGeo.setAttribute('aFx', new THREE.BufferAttribute(new Float32Array(hoopGeo.attributes.position.count * 2).fill(1), 2));
    for (const hp of this.hoops) {
      const hm = litMaterial({ glow: 0.5, tint: this.info.color });
      const m = new THREE.Mesh(hoopGeo, hm);
      m.position.set(hp.x, hp.y, hp.z);
      this.group.add(m);
      hp.mesh = m;
    }
    // light crystals
    const cg = crystalCluster(19, { count: 6, fat: 1.2 });
    const cm = litMaterial({ gem: true, glow: 0.9, spec: 1, shin: 80, tint: new THREE.Color(c.r * 1.4 + 0.2, c.g * 1.4 + 0.2, c.b * 1.4 + 0.2).getHex() });
    for (const l of this.lights) {
      if (!l.crystal) continue;
      const m = new THREE.Mesh(cg, cm);
      m.position.set(l.x, 0, l.z);
      m.scale.setScalar(2.2);
      this.group.add(m);
      this.colliders.addCircle(l.x, l.z, 0.7, 3, { walk: false });
    }
    // keystone pedestal
    const kg = new Geo();
    kg.add(temp(new THREE.CylinderGeometry(0.8, 1.1, 1.0, 6)), M.trs(0, 0.5, 0), (p, n, o) => { o[0] = 0.16; o[1] = 0.16; o[2] = 0.2; if (Math.abs(p.y - 0.3) < 0.05) { o[0] = 1; o[1] = 0.9; o[2] = 0.5; o[3] = 1; } }, true);
    const ped = new THREE.Mesh(kg.build(), stoneMat());
    ped.position.copy(this.keyPos);
    this.group.add(ped);
    this.colliders.addCircle(this.keyPos.x, this.keyPos.z, 1.0, 1.0, { walk: false });
    const kgem = new Geo();
    kgem.add(temp(new THREE.OctahedronGeometry(0.34)), M.trs(0, 0, 0, 0, 0, 0, 1, 1.6, 1), (p, n, o) => { o[0] = 1; o[1] = 0.93; o[2] = 0.6; o[3] = 1; }, true);
    this.keyMesh = new THREE.Mesh(kgem.build(), litMaterial({ gem: true, glow: 2.4, spec: 1, shin: 80 }));
    this.keyMesh.position.set(this.keyPos.x, 2.0, this.keyPos.z);
    this.group.add(this.keyMesh);
    const s = this.game.state;
    this.keyTaken = s.keystones >= this.info.key;
    this.keyMesh.visible = !this.keyTaken;
    this.interactables.push({
      id: 'keystone', pos: new THREE.Vector3(this.keyPos.x, 1.2, this.keyPos.z), r: 3.2,
      label: () => (this.keyTaken ? null : this.regions[this.region[Math.floor(this.keyPos.z / CELL) * this.w + Math.floor(this.keyPos.x / CELL)]].enemies > 0 ? 'The Keystone is sealed while its guardian stands' : 'Take the Keystone'),
      act: () => this.takeKey(),
    });
    // exit portal behind the start
    this.exit = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), portalMaterial(this.info.color, 0xffffff));
    this.exit.position.set(this.start.x - 5.6, 2.2, this.start.z);
    this.exit.rotation.y = Math.PI / 2;
    this.exit.material.uniforms.uOn.value = 1;
    this.group.add(this.exit);
    this.interactables.push({ id: 'exit', pos: new THREE.Vector3(this.start.x - 4.4, 1.2, this.start.z), r: 3.0, label: () => 'Leave the vault', act: () => this.game.leaveVault() });
    this.exit2 = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), portalMaterial(this.info.color, 0xffffff));
    this.exit2.position.set(this.keyPos.x, 2.0, this.keyPos.z + 3.4);
    this.exit2.visible = false;
    this.group.add(this.exit2);
    this.interactables.push({ id: 'exit2', pos: new THREE.Vector3(this.keyPos.x, 1.2, this.keyPos.z + 3.0), r: 2.6, label: () => (this.exit2.visible ? 'Step through to the surface' : null), act: () => this.game.leaveVault() });
    this.regions[this.region[Math.floor(this.start.z / CELL) * w + Math.floor(this.start.x / CELL)]].reached = true;
  }

  // called once the world is active so creatures register with the game
  populate() {
    const g = this.game;
    const mul = 1 + (this.tier - 1) * 0.45;
    for (const sp of this.spawns) {
      g.spawnCreature(sp.type, sp.x, sp.type === 'sentinel' ? 1.9 : 0, sp.z, { tag: 'v' + sp.region, hpMul: mul, dmgMul: 1 + (this.tier - 1) * 0.3 });
    }
  }

  onCreatureDeath(c) {
    if (c.tag && c.tag[0] === 'v') { const r = this.regions[+c.tag.slice(1)]; if (r) r.enemies = Math.max(0, r.enemies - 1); }
  }

  takeKey() {
    if (this.keyTaken) return;
    const kr = this.regions[this.region[Math.floor(this.keyPos.z / CELL) * this.w + Math.floor(this.keyPos.x / CELL)]];
    if (kr.enemies > 0) { this.game.ui.toast('The guardian still stands', 'warn'); return; }
    this.keyTaken = true;
    this.keyMesh.visible = false;
    this.exit2.visible = true;
    this.exit2.material.uniforms.uOn.value = 1;
    this.game.onKeystone(this.info.key, this.id);
  }

  _cell(x, z) {
    const ix = Math.floor(x / CELL), iz = Math.floor(z / CELL);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return WALL;
    return this.height[iz * this.w + ix];
  }

  groundAt(x, z, feetY) {
    const hgt = this._cell(x, z);
    const base = hgt >= WALL ? 0 : hgt;
    return this.colliders.groundAt(x, z, feetY, base);
  }

  resolve(pos, radius, feetY, headY) {
    const ix = Math.floor(pos.x / CELL), iz = Math.floor(pos.z / CELL);
    let hit = false;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx, cz = iz + dz;
      let hgt = WALL;
      if (cx >= 0 && cz >= 0 && cx < this.w && cz < this.h) hgt = this.height[cz * this.w + cx];
      if (hgt <= feetY + 0.5) continue;
      const x0 = cx * CELL, z0 = cz * CELL;
      const nx = Math.max(x0, Math.min(pos.x, x0 + CELL)), nz = Math.max(z0, Math.min(pos.z, z0 + CELL));
      const ddx = pos.x - nx, ddz = pos.z - nz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 < radius * radius) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = nx + (ddx / d) * radius; pos.z = nz + (ddz / d) * radius; }
        else { // centre is inside the cell: push out along the shallowest axis
          const l = pos.x - x0, r = x0 + CELL - pos.x, t = pos.z - z0, b = z0 + CELL - pos.z;
          const m = Math.min(l, r, t, b);
          if (m === l) pos.x = x0 - radius; else if (m === r) pos.x = x0 + CELL + radius; else if (m === t) pos.z = z0 - radius; else pos.z = z0 + CELL + radius;
        }
        hit = true;
      }
    }
    return this.colliders.resolve(pos, radius, feetY, headY) || hit;
  }

  solidAt(x, y, z) {
    const hgt = this._cell(x, z);
    if (hgt >= WALL) return y < WALL_H + 0.5;
    return y < hgt || this.colliders.blocked(x, y, z);
  }

  walkable(x, z, y) {
    const hgt = this._cell(x, z);
    return hgt < WALL && hgt > PIT + 1 && Math.abs(hgt - y) < 1.7 && !this.colliders.blocked(x, hgt + 0.6, z);
  }

  safeAt() { return false; }
  spawnPoint() { return { pos: this.start.clone(), yaw: -Math.PI / 2 }; }
  refresh() {}

  activate() {
    const c = this.color;
    G.uInterior.value = 1;
    G.uWorld.value.w = 0;
    G.uSunColor.value.setRGB(0, 0, 0);
    G.uAmbSky.value.setRGB(0.2 + c.r * 0.22, 0.22 + c.g * 0.22, 0.28 + c.b * 0.22);
    G.uAmbGround.value.setRGB(0.1 + c.r * 0.12, 0.1 + c.g * 0.12, 0.13 + c.b * 0.12);
    G.uHorizon.value.setRGB(c.r * 0.35 + 0.05, c.g * 0.35 + 0.05, c.b * 0.35 + 0.08);
    G.uZenith.value.setRGB(0, 0, 0);
    G.uSunGlow.value.setRGB(0, 0, 0);
    G.uFog.value.set(0.011, 0.0001, 0, 0.85);
    G.uNight.value = 0.6;
  }

  update(dt, camPos, playerPos) {
    const g = this.game, p = g.player;
    this.time += dt;
    // remember the last solid footing for pit recovery
    const under = this._cell(playerPos.x, playerPos.z);
    if (p.onGround && under > PIT + 1 && under < WALL) this.safe.copy(playerPos);
    if (playerPos.y < PIT + 1.5 && !p.dead) {
      p.damage(18, null, true);
      p.pos.copy(this.safe); p.vel.set(0, 0, 0);
      g.ui.toast('The vault floor drops away beneath you', 'warn');
    }
    const preg = this.region[Math.floor(playerPos.z / CELL) * this.w + Math.floor(playerPos.x / CELL)];
    if (preg >= 0 && this.regions[preg]) this.regions[preg].reached = true;
    // hoops
    for (const hp of this.hoops) {
      hp.mesh.rotation.y += dt * (hp.lit ? 2.6 : 0.9);
      if (!hp.lit) {
        const d = Math.hypot(playerPos.x - hp.x, playerPos.y + 1.0 - hp.y, playerPos.z - hp.z);
        if (d < 1.55) {
          hp.lit = true;
          hp.mesh.material.uniforms.uMat2.value.x = 3.0;
          this.regions[hp.region].hoops--;
          g.particles.burst(new THREE.Vector3(hp.x, hp.y, hp.z), 34, 7, 0.8, 1.1, this.color.r, this.color.g, this.color.b, { gravity: 0 });
          g.audio.play('ring');
          const left = this.regions[hp.region].hoops;
          g.ui.toast(left > 0 ? `Resonance ring attuned. ${left} left` : 'All rings attuned', 'good');
        }
      }
      if (Math.hypot(hp.x - playerPos.x, hp.z - playerPos.z) < 40) addLight(hp.x, hp.y, hp.z, hp.lit ? 9 : 6, this.color.r * (hp.lit ? 1.4 : 0.5), this.color.g * (hp.lit ? 1.4 : 0.5), this.color.b * (hp.lit ? 1.4 : 0.5));
    }
    // doors open when a reached neighbouring region is fully cleared
    for (const d of this.doors) {
      if (!d.open) {
        for (const r of d.regs) {
          const R = this.regions[r];
          if (R && R.reached && R.enemies <= 0 && R.hoops <= 0) { d.open = true; g.audio.play('door'); break; }
        }
        d.mesh.material.uniforms.uLocked.value = 1;
      } else if (d.k < 1) {
        d.k = Math.min(1, d.k + dt * 1.1);
        d.mesh.position.y = 3.2 - d.k * 6.6;
        d.mesh.material.uniforms.uOpen.value = 1 - d.k;
        d.mesh.material.uniforms.uLocked.value = 0;
        if (d.k >= 1) { this.height[d.z * this.w + d.x] = 0; d.mesh.visible = false; }
      }
    }
    if (this.keyMesh.visible) {
      this.keyMesh.rotation.y += dt * 1.2;
      this.keyMesh.position.y = 2.0 + Math.sin(this.time * 1.8) * 0.15;
      addLight(this.keyPos.x, 2.2, this.keyPos.z, 10, 1.3, 1.15, 0.7);
    }
    for (const l of this.lights) {
      if (Math.hypot(l.x - playerPos.x, l.z - playerPos.z) < 44) addLight(l.x, l.y, l.z, 13, this.color.r * 1.2 + 0.1, this.color.g * 1.2 + 0.1, this.color.b * 1.2 + 0.1);
    }
    addLight(this.exit.position.x + 1, 2.2, this.exit.position.z, 8, this.color.r, this.color.g, this.color.b);
    // drifting motes
    if (Math.random() < dt * 14) {
      g.particles.emit(playerPos.x + (Math.random() - 0.5) * 30, Math.random() * 7, playerPos.z + (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 0.3, 0.15, (Math.random() - 0.5) * 0.3, 5, 0.22, this.color.r, this.color.g, this.color.b, 0, 0);
    }
  }

  dispose() {
    this.group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.dispose) o.material.dispose(); } });
  }
}
