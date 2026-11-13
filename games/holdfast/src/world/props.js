// World props: fences, power lines, lamps, floodwall + mural, water tower,
// grain bins, silos, church spire, signs, awnings, cars, mailboxes,
// headstones and hay bales. Static geometry is merged per 128 m tile into
// the atlas material; textured signs share one canvas atlas.
import * as THREE from 'three';
import { GeoBuilder, rgb, mulc } from '../geom.js';
import { buildingMaterial } from '../atlas.js';
import { mulberry32 } from '../util.js';
import { TOWN_NAME } from './layout.js';

const TILE = 128;

export class PropBuilder {
  constructor(world) {
    this.world = world;
    this.tiles = new Map();
    this.signQueue = [];
    this.lampPositions = [];
    this.loot = [];
    this.carCount = 0;
  }
  b(x, z) {
    const k = Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
    let g = this.tiles.get(k);
    if (!g) { g = new GeoBuilder(); this.tiles.set(k, g); }
    return g;
  }
  solid(x0, y0, z0, x1, y1, z1, kind = 'prop') {
    this.world.physics.add({ min: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], max: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], kind }, 'props');
  }
  // oriented box along a segment (thin beams, rails, wires)
  beam(key, ax, ay, az, bx, by, bz, w, h, color) {
    const g = this.b((ax + bx) / 2, (az + bz) / 2);
    const dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz) || 1e-6;
    const nx = -dz / L * w / 2, nz = dx / L * w / 2;
    const A = [ax - nx, ay - h / 2, az - nz], B = [ax + nx, ay - h / 2, az + nz], C = [bx + nx, by - h / 2, bz + nz], D = [bx - nx, by - h / 2, bz - nz];
    const A2 = [A[0], ay + h / 2, A[2]], B2 = [B[0], ay + h / 2, B[2]], C2 = [C[0], by + h / 2, C[2]], D2 = [D[0], by + h / 2, D[2]];
    const c = Array.isArray(color) ? color : rgb(color);
    const n = (x, y, z) => [x, y, z];
    g.quad(key, A2, B2, C2, D2, c, null, n(0, 1, 0));
    g.quad(key, A, D, C, B, mulc(c, 0.7), null, n(0, -1, 0));
    g.quad(key, B, C, C2, B2, mulc(c, 0.9), null, n(nx, 0, nz));
    g.quad(key, A, A2, D2, D, mulc(c, 0.9), null, n(-nx, 0, -nz));
  }
  cyl(key, x, y, z, r0, r1, h, color, seg = 8, uvU = 1, uvV = 1) {
    const geo = new THREE.CylinderGeometry(r1, r0, h, seg, 1);
    if (uvU !== 1 || uvV !== 1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uvU, uv.getY(i) * uvV); }
    const m = new THREE.Matrix4().makeTranslation(x, y + h / 2, z);
    this.b(x, z).geometry(key, geo, m, Array.isArray(color) ? color : rgb(color));
    geo.dispose();
  }
  cone(key, x, y, z, r, h, color, seg = 10, uvU = 1) {
    const geo = new THREE.ConeGeometry(r, h, seg, 1);
    if (uvU !== 1) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * uvU); }
    const m = new THREE.Matrix4().makeTranslation(x, y + h / 2, z);
    this.b(x, z).geometry(key, geo, m, Array.isArray(color) ? color : rgb(color));
    geo.dispose();
  }
  sphere(key, x, y, z, r, color, sy = 1, phiLen = Math.PI * 2, thetaLen = Math.PI) {
    const geo = new THREE.SphereGeometry(r, 12, 8, 0, phiLen, 0, thetaLen);
    const m = new THREE.Matrix4().makeScale(1, sy, 1).setPosition(x, y, z);
    this.b(x, z).geometry(key, geo, m, Array.isArray(color) ? color : rgb(color));
    geo.dispose();
  }
  box(key, x0, y0, z0, x1, y1, z1, color, faces = null) {
    this.b((x0 + x1) / 2, (z0 + z1) / 2).box(key, Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1), Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1), Array.isArray(color) ? color : rgb(color), faces);
  }

  // ---------------- fences ----------------
  // kind: 'wire' (barbed wire, wooden posts), 'board' (white 3-rail), 'picket'
  fence(points, kind = 'wire', gaps = []) {
    const H = (x, z) => this.world.terrain.height(x, z);
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, az] = points[i], [bx, bz] = points[i + 1];
      const L = Math.hypot(bx - ax, bz - az);
      const step = kind === 'wire' ? 3 : 2.4;
      const n = Math.max(1, Math.round(L / step));
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const inGap = gaps.some(([gx, gz, r]) => Math.hypot(x - gx, z - gz) < r);
        if (this.world.roadDist && this.world.roadDist(x, z) < 1.5) { prev = null; continue; }
        if (this.world.fenceBlocked && this.world.fenceBlocked(x, z)) { prev = null; continue; }
        if (inGap) { prev = null; continue; }
        const y = H(x, z);
        const ph = kind === 'wire' ? 1.25 : kind === 'board' ? 1.3 : 1.0;
        const pc = kind === 'wire' ? '#6a5a48' : kind === 'board' ? '#efece4' : '#f2efe8';
        const pw = kind === 'wire' ? 0.09 : 0.12;
        this.box('plain:matte', x - pw / 2, y - 0.3, z - pw / 2, x + pw / 2, y + ph, z + pw / 2, pc);
        if (prev) {
          const [px, pz, py] = prev;
          if (kind === 'wire') {
            for (const hh of [0.45, 0.75, 1.05]) this.beam('plain:metal', px, py + hh, pz, x, y + hh, z, 0.012, 0.012, '#5a5a58');
          } else if (kind === 'board') {
            for (const hh of [0.35, 0.75, 1.15]) this.beam('plain:paint', px, py + hh, pz, x, y + hh, z, 0.03, 0.14, '#efece4');
          } else {
            const segs = Math.round(Math.hypot(x - px, z - pz) / 0.15);
            for (let s = 1; s < segs; s++) {
              const u = s / segs, sx = px + (x - px) * u, sz = pz + (z - pz) * u, sy = py + (y - py) * u;
              this.box('plain:paint', sx - 0.035, sy, sz - 0.035, sx + 0.035, sy + 0.9, sz + 0.035, '#f2efe8');
            }
            for (const hh of [0.2, 0.7]) this.beam('plain:paint', px, py + hh, pz, x, y + hh, z, 0.03, 0.08, '#f2efe8');
          }
          // collision for the run
          const dx = x - px, dz = z - pz;
          const steps = Math.ceil(Math.hypot(dx, dz) / 0.6);
          for (let s = 0; s <= steps; s++) {
            const u = s / steps, cx = px + dx * u, cz = pz + dz * u, cy = py + (y - py) * u;
            this.world.physics.add({ min: [cx - 0.12, cy - 0.3, cz - 0.12], max: [cx + 0.12, cy + ph - 0.1, cz + 0.12], kind: 'fence' }, 'fences');
          }
        }
        prev = [x, z, y];
      }
    }
  }

  // ---------------- power line ----------------
  powerLine(samples, side = 1, spacing = 42, off = 7) {
    const H = (x, z) => this.world.terrain.height(x, z);
    const poles = [];
    let acc = spacing;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1], b = samples[i];
      acc += Math.hypot(b.x - a.x, b.z - a.z);
      if (acc < spacing) continue;
      acc = 0;
      const nx = b.nx || 0, nz = b.nz || 0;
      const x = b.x + nx * off * side, z = b.z + nz * off * side;
      if (this.world.inOccupied && this.world.inOccupied(x, z, 1)) continue;
      if (this.world.onStreet && this.world.onStreet(x, z, 0)) continue;
      if (this.world.roadDist && this.world.roadDist(x, z) < 2.5) continue; // another road crosses here
      poles.push({ x, z, y: H(x, z), dx: b.dx || 1, dz: b.dz || 0 });
    }
    const top = 8.2;
    for (const p of poles) {
      this.cyl('plain:matte', p.x, p.y - 0.5, p.z, 0.14, 0.11, top + 0.5, '#5e4e3e', 7);
      // crossarm perpendicular to the line direction
      const cx = -p.dz, cz = p.dx;
      this.beam('plain:matte', p.x - cx * 1.0, p.y + top - 0.5, p.z - cz * 1.0, p.x + cx * 1.0, p.y + top - 0.5, p.z + cz * 1.0, 0.1, 0.1, '#5e4e3e');
      for (const o of [-0.85, 0, 0.85]) this.box('plain:plastic', p.x + cx * o - 0.04, p.y + top - 0.44, p.z + cz * o - 0.04, p.x + cx * o + 0.04, p.y + top - 0.3, p.z + cz * o + 0.04, '#7a8a6a');
      this.solid(p.x - 0.16, p.y - 0.5, p.z - 0.16, p.x + 0.16, p.y + top, p.z + 0.16, 'tree');
    }
    // sagging wires between consecutive poles
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], b = poles[i + 1];
      if (Math.hypot(b.x - a.x, b.z - a.z) > spacing * 1.8) continue;
      for (const o of [-0.85, 0, 0.85]) {
        const ax = a.x - a.dz * o, az = a.z + a.dx * o, bx = b.x - b.dz * o, bz = b.z + b.dx * o;
        const ya = a.y + top - 0.3, yb = b.y + top - 0.3;
        const N = 8;
        for (let k = 0; k < N; k++) {
          const t0 = k / N, t1 = (k + 1) / N;
          const sag = (t) => -1.4 * 4 * t * (1 - t);
          this.beam('plain:metal', ax + (bx - ax) * t0, ya + (yb - ya) * t0 + sag(t0), az + (bz - az) * t0, ax + (bx - ax) * t1, ya + (yb - ya) * t1 + sag(t1), az + (bz - az) * t1, 0.025, 0.025, '#2a2a28');
        }
      }
    }
  }

  // ---------------- street lamp (double acorn) ----------------
  lamp(x, z, y, style = 'acorn') {
    this.cyl('plain:metal', x, y, z, 0.16, 0.12, 0.5, '#2c3a32', 10);
    this.cyl('plain:metal', x, y, z, 0.07, 0.05, 3.9, '#2c3a32', 8);
    if (style === 'acorn') {
      this.beam('plain:metal', x - 0.55, y + 3.6, z, x + 0.55, y + 3.6, z, 0.06, 0.06, '#2c3a32');
      for (const o of [-0.55, 0.55]) {
        this.cyl('plain:metal', x + o, y + 3.6, z, 0.08, 0.08, 0.12, '#2c3a32', 8);
        this.lampPositions.push([x + o, y + 3.95, z]);
      }
      this.cyl('plain:metal', x, y + 3.9, z, 0.05, 0.05, 0.4, '#2c3a32', 8);
    } else {
      this.lampPositions.push([x, y + 4.05, z]);
    }
    this.solid(x - 0.18, y, z - 0.18, x + 0.18, y + 4, z + 0.18, 'tree');
  }

  // ---------------- grain bin & silo ----------------
  grainBin(x, z, r) {
    const y = this.world.terrain.height(x, z) - 0.2;
    const h = r * 1.5;
    const circ = 2 * Math.PI * r;
    this.cyl('concrete', x, y - 0.2, z, r + 0.3, r + 0.3, 0.45, '#d8d4cc', 20);
    this.cyl('metal', x, y, z, r, r, h, '#d4d6d8', 24, circ / 1.2, h / 1.2);
    this.cone('roofMetal', x, y + h, z, r + 0.12, r * 0.7, '#cfd1d3', 24, circ / 1.2);
    this.cyl('plain:metal', x, y + h + r * 0.68, z, 0.35, 0.3, 0.35, '#b8bcc0', 10);
    // ladder
    this.box('plain:metal', x + r + 0.02, y + 0.5, z - 0.2, x + r + 0.06, y + h, z + 0.2, '#9aa0a6');
    this.solid(x - r, y, z - r, x + r, y + h, z + r);
  }
  silo(x, z) {
    const y = this.world.terrain.height(x, z) - 0.3;
    const r = 2.4, h = 15;
    this.cyl('concrete', x, y, z, r, r, h, '#cfc8bc', 20, (2 * Math.PI * r) / 3, h / 3);
    for (let k = 1; k < 10; k++) this.cyl('plain:metal', x, y + k * 1.5, z, r + 0.03, r + 0.03, 0.06, '#6a6a68', 20);
    this.sphere('roofMetal', x, y + h, z, r + 0.05, '#b8bcc0', 0.7, Math.PI * 2, Math.PI / 2);
    this.solid(x - r, y, z - r, x + r, y + h, z + r);
  }
  // A country grain elevator: a row of tall concrete bins, the headhouse and
  // leg on top, a metal annex and a spout out to the truck lane.
  elevator(x, z, y0) {
    const y = (y0 ?? this.world.terrain.height(x, z)) - 0.3;
    const r = 3.1, h = 23;
    this.box('concrete', x - 9.6, y - 0.4, z - 4, x + 9.6, y + 0.35, z + 4, '#cfcac0');
    for (const dx of [-6.2, 0, 6.2]) {
      this.cyl('concrete', x + dx, y, z, r, r, h, '#d6d0c4', 24, (2 * Math.PI * r) / 3, h / 3);
      // pour lines
      for (let k = 1; k < 12; k++) this.cyl('plain:paint', x + dx, y + k * 1.9, z, r + 0.02, r + 0.02, 0.05, '#bab3a6', 24);
      this.cyl('concrete', x + dx, y + h, z, r + 0.15, r + 0.15, 0.4, '#cbc4b8', 24);
      this.solid(x + dx - r, y, z - r, x + dx + r, y + h, z + r);
    }
    // the gallery along the top and the headhouse over the middle bin
    this.box('metal', x - 9.4, y + h + 0.4, z - 1.6, x + 9.4, y + h + 2.8, z + 1.6, '#b9bec2');
    this.box('roofMetal', x - 9.6, y + h + 2.8, z - 1.8, x + 9.6, y + h + 3.0, z + 1.8, '#9aa0a4');
    this.box('metal', x - 2.6, y + h + 2.8, z - 2.6, x + 2.6, y + h + 8.5, z + 2.6, '#c3c7ca');
    this.box('roofMetal', x - 2.8, y + h + 8.5, z - 2.8, x + 2.8, y + h + 8.8, z + 2.8, '#8f959a');
    for (const dz of [-2.61, 2.61]) this.box('glass', x - 1.2, y + h + 5.5, z + dz - 0.01, x + 1.2, y + h + 6.6, z + dz + 0.01, '#ffffff');
    // the leg, running down the face to the pit
    this.box('metal', x + 9.6, y, z - 1.0, x + 11.0, y + h + 6, z + 0.4, '#a9afb3');
    this.solid(x + 9.6, y, z - 1.0, x + 11.0, y + h + 6, z + 0.4);
    // a lean-to annex with a big door, and the spout over the truck lane
    this.box('metal', x - 15.5, y, z - 3.6, x - 9.6, y + 6, z + 3.6, '#b4a58c');
    this.box('roofMetal', x - 15.8, y + 6, z - 3.9, x - 9.4, y + 6.25, z + 3.9, '#7d6f5d');
    this.box('plain:matte', x - 15.52, y + 0.2, z - 2.1, x - 15.48, y + 4.2, z + 2.1, '#5a5048');
    this.solid(x - 15.5, y, z - 3.6, x - 9.6, y + 6, z + 3.6);
    this.beam('plain:metal', x + 2.6, y + h + 7, z + 1.2, x + 7, y + 7, z + 9, 0.35, 0.35, '#8a9096');
    // ladder up the east bin
    this.box('plain:metal', x + 6.2 + r + 0.02, y + 1, z - 0.25, x + 6.2 + r + 0.08, y + h, z + 0.25, '#8f969c');
    this.signQueue.push({ type: 'band', text: 'CARVER CO-OP', x, y: y + h - 4.5, z, r: r + 0.02, h: 1.8 });
  }
  // A green highway sign on two posts: a place name and a second line.
  townSign(x, z, text, line2) {
    const y = this.world.terrain.height(x, z);
    for (const dx of [-1.25, 1.25]) {
      this.box('plain:metal', x + dx - 0.05, y - 0.3, z - 0.05, x + dx + 0.05, y + 2.9, z + 0.05, '#9aa0a6');
      this.solid(x + dx - 0.08, y, z - 0.08, x + dx + 0.08, y + 2.9, z + 0.08);
    }
    this.box('plain:paint', x - 1.75, y + 1.65, z - 0.04, x + 1.75, y + 2.95, z + 0.02, '#1f5a3a');
    this.storeSign(text, x, y + 2.5, z + 0.03, 3.3, 0.55, [0, 0, 1], ['#1f5a3a', '#f2f2ea']);
    this.storeSign(line2, x, y + 1.95, z + 0.03, 1.6, 0.4, [0, 0, 1], ['#1f5a3a', '#f2f2ea']);
    this.storeSign(text, x, y + 2.5, z - 0.05, 3.3, 0.55, [0, 0, -1], ['#1f5a3a', '#f2f2ea']);
    this.storeSign(line2, x, y + 1.95, z - 0.05, 1.6, 0.4, [0, 0, -1], ['#1f5a3a', '#f2f2ea']);
  }
  // A concrete culvert end: headwall and the dark mouth of the pipe. yaw is
  // the direction the pipe runs out of the embankment.
  culvert(x, z, y, yaw) {
    const g = this.b(x, z);
    const m = new THREE.Matrix4();
    const put = (geo, key, col, lx, ly, lz, rx = 0) => {
      m.makeRotationY(yaw).multiply(new THREE.Matrix4().makeTranslation(lx, ly, lz)).multiply(new THREE.Matrix4().makeRotationX(rx));
      m.setPosition(new THREE.Vector3(lx, ly, lz).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, y, z)));
      g.geometry(key, geo, m, rgb(col));
      geo.dispose();
    };
    // the headwall across the pipe end, then the pipe ring and its dark inside
    put(new THREE.BoxGeometry(3.6, 2.2, 0.45), 'concrete', '#b9b3a8', 0, 1.0, -0.2);
    put(new THREE.CylinderGeometry(0.82, 0.82, 0.7, 20, 1, true), 'concrete', '#a7a196', 0, 0.85, 0.15, Math.PI / 2);
    put(new THREE.CircleGeometry(0.78, 20), 'plain:matte', '#16140f', 0, 0.85, 0.02);
    // wing walls angled back into the bank
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(0.35, 1.6, 2.0);
      const mm = new THREE.Matrix4().makeRotationY(yaw + side * 0.5);
      mm.setPosition(new THREE.Vector3(side * 1.95, 0.75, 0.75).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw).add(new THREE.Vector3(x, y, z)));
      g.geometry('concrete', geo, mm, rgb('#b5afa4'));
      geo.dispose();
    }
  }
  waterTower(x, z) {
    const y = this.world.terrain.height(x, z);
    const H = 20, R = 4.2;
    for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.beam('plain:metal', x + lx * 3.6, y - 0.3, z + lz * 3.6, x + lx * 2.4, y + H, z + lz * 2.4, 0.32, 0.32, '#c6cacd');
      this.box('concrete', x + lx * 3.6 - 0.5, y - 0.5, z + lz * 3.6 - 0.5, x + lx * 3.6 + 0.5, y + 0.3, z + lz * 3.6 + 0.5, '#d0ccc4');
      this.solid(x + lx * 3.6 - 0.3, y, z + lz * 3.6 - 0.3, x + lx * 3.6 + 0.3, y + 6, z + lz * 3.6 + 0.3);
    }
    // cross bracing
    for (const hh of [5, 11, 17]) {
      const k = 3.6 - (hh / H) * 1.2;
      const c = [[-k, -k], [k, -k], [k, k], [-k, k]];
      for (let i = 0; i < 4; i++) this.beam('plain:metal', x + c[i][0], y + hh, z + c[i][1], x + c[(i + 1) % 4][0], y + hh, z + c[(i + 1) % 4][1], 0.1, 0.1, '#b6babd');
    }
    this.cyl('plain:metal', x, y, z, 0.5, 0.5, H + 1, '#c6cacd', 10);
    this.cyl('plain:paint', x, y + H, z, R, R, 5, '#d8dcdf', 28);
    this.sphere('plain:paint', x, y + H, z, R, '#d0d4d7', 0.45, Math.PI * 2, Math.PI);
    this.cone('plain:paint', x, y + H + 5, z, R + 0.05, 2.6, '#c8ccd0', 28);
    this.cyl('plain:metal', x, y + H - 0.1, z, R + 0.9, R + 0.9, 0.12, '#9aa0a4', 28);
    // name band
    this.signQueue.push({ type: 'band', text: TOWN_NAME.toUpperCase(), x, y: y + H + 1.4, z, r: R + 0.02, h: 2.2 });
  }
  spire(x, y, z) {
    this.box('plain:paint', x - 0.9, y, z - 0.9, x + 0.9, y + 2.6, z + 0.9, '#f2f0ea');
    for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      // louvered belfry openings
      this.box('plain:matte', x + dx * 0.91 - (dz ? 0.45 : 0.01), y + 0.6, z + dz * 0.91 - (dx ? 0.45 : 0.01), x + dx * 0.91 + (dz ? 0.45 : 0.01), y + 2.0, z + dz * 0.91 + (dx ? 0.45 : 0.01), '#3a3a3a');
    }
    this.cone('shingles', x, y + 2.6, z, 1.25, 7.5, '#4a4b4f', 8, 4);
    this.box('plain:chrome', x - 0.05, y + 10, z - 0.05, x + 0.05, y + 11.4, z + 0.05, '#c9a64a');
    this.box('plain:chrome', x - 0.4, y + 10.8, z - 0.05, x + 0.4, y + 10.9, z + 0.05, '#c9a64a');
  }

  // ---------------- floodwall ----------------
  floodwall(x, z0, z1, gate, topY) {
    const H = (xx, zz) => this.world.terrain.height(xx, zz);
    const segs = [[z0, gate[0]], [gate[1], z1]];
    for (const [a, b] of segs) {
      for (let z = a; z < b; z += 4) {
        const zb = Math.min(b, z + 4);
        const yb = Math.min(H(x - 0.5, z), H(x + 1.5, z), H(x - 0.5, zb), H(x + 1.5, zb)) - 1.5;
        this.box('concrete', x, yb, z, x + 1, topY, zb, '#d8d4cc');
        // expansion joint lines
        this.box('plain:matte', x - 0.005, yb, z, x + 1.005, topY + 0.005, z + 0.04, '#9a968e');
        this.solid(x, yb, z, x + 1, topY, zb);
      }
      // cap
      this.box('concrete', x - 0.1, topY, a, x + 1.1, topY + 0.25, b, '#e2ded6');
    }
    // gate posts & track
    for (const gz of gate) {
      this.box('plain:metal', x - 0.2, H(x, gz) - 0.2, gz - (gz < 0 ? 0.6 : 0), x + 1.2, topY + 0.6, gz + (gz < 0 ? 0 : 0.6), '#5a6a62');
    }
    const my0 = Math.max(H(x + 1.5, 30), H(x + 1.5, -30)) + 0.35;
    this.signQueue.push({ type: 'mural', x: x + 1.02, z0: 12, z1: 46, y0: my0, y1: topY - 0.12 });
    this.signQueue.push({ type: 'mural2', x: x + 1.02, z0: -46, z1: -12, y0: my0, y1: topY - 0.12 });
  }

  // ---------------- cars ----------------
  // a parked car: the vehicle system builds and runs it once the world exists
  car(x, z, yaw, color, kind = 'sedan', y = null, o = {}) {
    (this.world.carSpots || (this.world.carSpots = [])).push({ x, z, yaw, paint: color, kind, y: y == null ? undefined : y, ...o });
  }

  mailbox(x, z, name) {
    const y = this.world.terrain.height(x, z);
    this.box('plain:matte', x - 0.05, y - 0.2, z - 0.05, x + 0.05, y + 1.05, z + 0.05, '#6a5a48');
    this.box('plain:metal', x - 0.12, y + 1.05, z - 0.25, x + 0.12, y + 1.3, z + 0.25, '#3a3a3a');
    this.box('plain:paint', x + 0.12, y + 1.15, z + 0.1, x + 0.14, y + 1.3, z + 0.13, '#b3322a');
    void name;
  }
  headstone(x, z, rng) {
    const y = this.world.terrain.height(x, z);
    const w = 0.45 + rng() * 0.25, h = 0.55 + rng() * 0.45;
    this.box('stone', x - w / 2, y - 0.3, z - 0.09, x + w / 2, y + h, z + 0.09, mulc(rgb('#b8b4ac'), 0.85 + rng() * 0.2));
  }
  roundBale(x, z, rot) {
    const y = this.world.terrain.height(x, z);
    const geo = new THREE.CylinderGeometry(0.75, 0.75, 1.3, 14);
    const m = new THREE.Matrix4().makeRotationY(rot).multiply(new THREE.Matrix4().makeRotationZ(Math.PI / 2));
    m.setPosition(x, y + 0.7, z);
    this.b(x, z).geometry('hay', geo, m, rgb('#f2e6c8'), 2);
    geo.dispose();
    this.solid(x - 0.75, y, z - 0.75, x + 0.75, y + 1.45, z + 0.75);
  }
  bench(x, z, y, rot) {
    const c = Math.abs(Math.cos(rot)) > 0.5;
    const w = 0.8, d = 0.25;
    const [ex, ez] = c ? [w, d] : [d, w];
    this.box('woodFurn', x - ex, y + 0.42, z - ez, x + ex, y + 0.48, z + ez, '#8a6a46');
    this.box('plain:metal', x - ex, y, z - ez, x - ex + 0.06, y + 0.45, z + ez, '#2c3a32');
    this.box('plain:metal', x + ex - 0.06, y, z - ez, x + ex, y + 0.45, z + ez, '#2c3a32');
  }
  hydrant(x, z, y) {
    this.cyl('plain:paint', x, y, z, 0.13, 0.11, 0.7, '#c4332a', 10);
    this.sphere('plain:paint', x, y + 0.7, z, 0.12, '#c4332a', 0.8);
  }

  // Road-closed barricade across a dead-end street: white/orange striped
  // boards on posts. (x, z) centre, alongX: boards run along X, w width.
  barricade(x, z, y, alongX, w) {
    const n = Math.max(1, Math.round(w / 2.6));
    const seg = w / n;
    for (let i = 0; i < n; i++) {
      const c0 = -w / 2 + i * seg + 0.25, c1 = c0 + seg - 0.5;
      const P = (u, v) => (alongX ? [x + u, z + v] : [x + v, z + u]);
      for (const u of [c0 + 0.1, c1 - 0.1]) {
        const [px, pz] = P(u, 0);
        this.box('plain:paint', px - 0.05, y, pz - 0.05, px + 0.05, y + 1.25, pz + 0.05, '#e8e4da');
      }
      // three boards of alternating stripes
      for (const hy of [0.45, 0.75, 1.05]) {
        const stripes = Math.max(2, Math.round((c1 - c0) / 0.3));
        for (let k = 0; k < stripes; k++) {
          const u0 = c0 + ((c1 - c0) * k) / stripes, u1 = c0 + ((c1 - c0) * (k + 1)) / stripes;
          const [ax, az] = P(u0, -0.07), [bx, bz] = P(u1, -0.03);
          this.box('plain:paint', Math.min(ax, bx), y + hy, Math.min(az, bz), Math.max(ax, bx), y + hy + 0.18, Math.max(az, bz), k % 2 ? '#e8e4da' : '#d8642a');
        }
      }
      const [qx0, qz0] = P(c0, -0.1), [qx1, qz1] = P(c1, 0.1);
      this.solid(Math.min(qx0, qx1), y, Math.min(qz0, qz1), Math.max(qx0, qx1), y + 1.25, Math.max(qz0, qz1), 'barricade');
    }
  }

  // ---------------- signs (textured) ----------------
  storeSign(text, x, y, z, w, h, normal, colors) { this.signQueue.push({ type: 'sign', text, x, y, z, w, h, normal, colors }); }
  awning(x0, x1, y, zWall, dir, color) {
    // dir = +1 if facade faces +z, -1 if -z
    const depth = 1.3, drop = 0.55;
    const g = this.b((x0 + x1) / 2, zWall);
    const z0 = zWall + dir * 0.12, z1 = zWall + dir * depth;
    const c = rgb(color);
    const stripes = 8;
    for (let i = 0; i < stripes; i++) {
      const a = x0 + (x1 - x0) * i / stripes, b = x0 + (x1 - x0) * (i + 1) / stripes;
      const cc = i % 2 ? c : rgb('#efe9dc');
      g.quad('fabric', [a, y, z0], [b, y, z0], [b, y - drop, z1], [a, y - drop, z1], cc, null, [0, 0.8, dir * 0.6]);
      g.quad('fabric', [a, y, z0], [a, y - drop, z1], [b, y - drop, z1], [b, y, z0], mulc(cc, 0.6), null, [0, -0.8, -dir * 0.6]);
      g.quad('fabric', [a, y - drop, z1], [b, y - drop, z1], [b, y - drop - 0.25, z1], [a, y - drop - 0.25, z1], mulc(cc, 0.9), null, [0, 0, dir]);
    }
  }

  buildSigns(scene) {
    const items = this.signQueue;
    if (!items.length) return;
    const SZ = 2048;
    const cv = document.createElement('canvas'); cv.width = SZ; cv.height = SZ;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#777'; ctx.fillRect(0, 0, SZ, SZ);
    const slots = []; // [u0, v0, u1, v1]
    let sx = 0, sy = 0;
    const pos = [], uv = [], nor = [], idx = [];
    const pushQuad = (a, b, c, d, n, r) => {
      const base = pos.length / 3;
      pos.push(...a, ...b, ...c, ...d);
      for (let i = 0; i < 4; i++) nor.push(...n);
      // r = [u0, v0, u1, v1] in canvas px; UV v flipped
      uv.push(r[0] / SZ, 1 - r[3] / SZ, r[2] / SZ, 1 - r[3] / SZ, r[2] / SZ, 1 - r[1] / SZ, r[0] / SZ, 1 - r[1] / SZ);
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const font = (px, w = 600) => `${w} ${px}px Oswald, 'Arial Narrow', Impact, sans-serif`;
    for (const it of items) {
      if (it.type === 'sign') {
        const W = 512, Hh = 128;
        if (sx + W > SZ) { sx = 0; sy += Hh; }
        const r = [sx, sy, sx + W, sy + Hh];
        const [bg, fg] = it.colors || ['#2f3b33', '#efe6c8'];
        ctx.fillStyle = bg; ctx.fillRect(r[0], r[1], W, Hh);
        ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(r[0] + 8, r[1] + 8, W - 16, Hh - 16);
        ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        let fs = 74; ctx.font = font(fs);
        while (ctx.measureText(it.text).width > W - 60 && fs > 20) { fs -= 4; ctx.font = font(fs); }
        ctx.fillText(it.text, r[0] + W / 2, r[1] + Hh / 2 + 3);
        sx += W;
        // geometry: quad on the facade
        const n = it.normal; // [nx, 0, nz]
        const tx = -n[2], tz = n[0]; // tangent (right when facing the sign)
        const hw = it.w / 2, hh = it.h / 2;
        const c0 = [it.x - tx * hw, it.y - hh, it.z - tz * hw], c1 = [it.x + tx * hw, it.y - hh, it.z + tz * hw];
        const c2 = [it.x + tx * hw, it.y + hh, it.z + tz * hw], c3 = [it.x - tx * hw, it.y + hh, it.z - tz * hw];
        pushQuad(c0, c1, c2, c3, n, r);
      }
    }
    // mural strips (painted panorama)
    sy += 140; sx = 0;
    for (const it of items) {
      if (it.type !== 'mural' && it.type !== 'mural2') continue;
      const W = SZ, Hh = Math.round(SZ * (it.y1 - it.y0) / (it.z1 - it.z0));
      const r = [0, sy, W, sy + Hh];
      paintMural(ctx, r, it.type === 'mural');
      sy += Hh + 8;
      const n = [1, 0, 0];
      const a = [it.x, it.y0, it.z1], b = [it.x, it.y0, it.z0], c = [it.x, it.y1, it.z0], d = [it.x, it.y1, it.z1];
      // left-to-right when viewed from the river (+x looking -x): +z on the left
      pushQuad(a, b, c, d, n, [r[0], r[1], r[2], r[3]]);
    }
    // water tower band
    for (const it of items) {
      if (it.type !== 'band') continue;
      const W = SZ, Hh = 120;
      const r = [0, sy, W, sy + Hh];
      ctx.fillStyle = '#d8dcdf'; ctx.fillRect(0, sy, W, Hh);
      ctx.fillStyle = '#2f4a6a'; ctx.font = font(84, 600); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(it.text, W * 0.25, sy + Hh / 2); ctx.fillText(it.text, W * 0.75, sy + Hh / 2);
      sy += Hh;
      const seg = 32;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const p = (a, y) => [it.x + Math.sin(a) * it.r, y, it.z + Math.cos(a) * it.r];
        const u0 = (i / seg) * W, u1 = ((i + 1) / seg) * W;
        pushQuad(p(a0, it.y - it.h / 2), p(a1, it.y - it.h / 2), p(a1, it.y + it.h / 2), p(a0, it.y + it.h / 2), [Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2)], [u0, r[1], u1, r[3]]);
      }
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    m.receiveShadow = true;
    scene.add(m);
  }

  finish(scene) {
    for (const g of this.tiles.values()) {
      for (const [key, geo] of g.build()) {
        const m = new THREE.Mesh(geo, key === 'glass' ? glassMat() : buildingMaterial());
        m.castShadow = key !== 'glass'; m.receiveShadow = true; m.matrixAutoUpdate = false;
        scene.add(m);
      }
    }
    this.buildSigns(scene);
  }
}
import { glassMaterial as glassMat } from '../atlas.js';

function paintMural(ctx, r, main) {
  const [x0, y0, x1, y1] = r;
  const W = x1 - x0, H = y1 - y0;
  // sky
  const sky = ctx.createLinearGradient(0, y0, 0, y1);
  sky.addColorStop(0, main ? '#6fa6cf' : '#e8a86a'); sky.addColorStop(0.6, main ? '#cfe2ea' : '#f4d8a8');
  ctx.fillStyle = sky; ctx.fillRect(x0, y0, W, H);
  const rng = mulberry32(main ? 11 : 12);
  // far hills
  ctx.fillStyle = main ? '#7a9a6a' : '#8a7a6a';
  ctx.beginPath(); ctx.moveTo(x0, y0 + H * 0.62);
  for (let x = 0; x <= W; x += 40) ctx.lineTo(x0 + x, y0 + H * (0.5 + 0.08 * Math.sin(x / 140) + 0.04 * Math.sin(x / 47)));
  ctx.lineTo(x1, y1); ctx.lineTo(x0, y1); ctx.fill();
  // river
  ctx.fillStyle = main ? '#4f7a92' : '#9a7a5a';
  ctx.fillRect(x0, y0 + H * 0.72, W, H * 0.12);
  // steamboat / barge silhouettes
  for (let i = 0; i < 3; i++) {
    const bx = x0 + W * (0.15 + i * 0.33) + rng() * 60, by = y0 + H * 0.76;
    ctx.fillStyle = '#efe9dc'; ctx.fillRect(bx, by - 30, 150, 24);
    ctx.fillStyle = '#2a2a2a'; ctx.fillRect(bx + 20, by - 62, 12, 34); ctx.fillRect(bx + 44, by - 62, 12, 34);
    ctx.fillStyle = '#9a2a22'; ctx.fillRect(bx - 10, by - 8, 170, 10);
    ctx.fillStyle = '#c84a2a'; ctx.beginPath(); ctx.arc(bx + 130, by - 14, 16, 0, Math.PI * 2); ctx.fill();
  }
  // foreground fields
  ctx.fillStyle = main ? '#c9a85a' : '#7a6a3a';
  ctx.fillRect(x0, y0 + H * 0.84, W, H * 0.16);
  // big lettering
  ctx.fillStyle = '#f6efd8'; ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 8;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(H * 0.28)}px Oswald, 'Arial Narrow', Impact, sans-serif`;
  const text = main ? `WELCOME TO ${TOWN_NAME.toUpperCase()}` : 'GATEWAY TO THE RIVER  ·  EST. 1806';
  ctx.strokeText(text, x0 + W / 2, y0 + H * 0.28);
  ctx.fillText(text, x0 + W / 2, y0 + H * 0.28);
  // frame
  ctx.strokeStyle = '#efe6c8'; ctx.lineWidth = 10; ctx.strokeRect(x0 + 6, y0 + 6, W - 12, H - 12);
}
