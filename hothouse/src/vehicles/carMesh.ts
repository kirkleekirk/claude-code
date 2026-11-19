import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { curve, smoothstep } from '@/core/math';
import { MeshBuilder, SurfFlag } from '@/render/geo/MeshBuilder';
import { DRIVER_WHEEL, SEAT_CUSHION } from '@/characters/ergonomics';
import { seatPoint, type BodyShape, type VehicleDef } from './defs';

/** Extra surface flags understood by the vehicle material. */
export const CarFlag = { PAINT: 16, HEADLIGHT: 32, TAILLIGHT: 64, SIREN: 128 } as const;

const PAINT = SurfFlag.WET | CarFlag.PAINT;

interface Frame {
  L: number;
  z: (t: number) => number;
  zf: number;
  zr: number;
  hw: (t: number) => number;
  belt: (t: number) => number;
  bottom: (z: number) => number;
}

function frame(s: BodyShape): Frame {
  const L = s.length;
  const zf = -L / 2 + s.frontAxle * L;
  const zr = zf + s.wheelbase;
  const archR = s.wheelR + 0.07;
  return {
    L,
    z: (t) => -L / 2 + t * L,
    zf,
    zr,
    hw: (t) => {
      const pinch = (1 - smoothstep(0, 0.1, t)) + smoothstep(0.9, 1, t);
      return (s.width / 2) * (1 - s.roundness * 0.16 * pinch);
    },
    belt: (t) => curve(s.belt, t),
    bottom: (z) => {
      let b = s.clearance;
      for (const zw of [zf, zr]) {
        const d = Math.abs(z - zw);
        if (d < archR) b = Math.max(b, s.wheelR + Math.sqrt(archR * archR - d * d) * 0.98);
      }
      return b;
    },
  };
}

/**
 * Cross-section of the lower body at t (right half, bottom centre → top centre). Convertible
 * cockpits and pickup beds drop the middle of the top to form a tub.
 */
function section(s: BodyShape, f: Frame, t: number): Array<[number, number]> {
  const hw = f.hw(t);
  const bot = f.bottom(f.z(t));
  const top = f.belt(t);
  const rB = 0.07;
  const rT = Math.min(0.2, (top - bot) * 0.33);
  const bulge = 0.025;
  const pts: Array<[number, number]> = [[0, bot], [hw - rB, bot]];
  pts.push([hw - rB * 0.3, bot + rB * 0.3], [hw, bot + rB]);
  pts.push([hw + bulge, bot + (top - bot) * 0.45]);
  pts.push([hw, top - rT], [hw - rT * 0.3, top - rT * 0.3], [hw - rT, top]);
  const tubFor = (t0: number, t1: number, depth: number, wall: number) => {
    const k = smoothstep(t0 - 0.01, t0 + 0.015, t) * (1 - smoothstep(t1 - 0.015, t1 + 0.01, t));
    if (k <= 0.001) return false;
    pts.push([hw - rT - wall, top]);
    pts.push([hw - rT - wall - 0.02, top - depth * k]);
    pts.push([0, top - depth * k]);
    return true;
  };
  let tub = false;
  if (s.convertible) tub = tubFor(s.cabin.start + 0.02, s.cabin.end, 0.52, 0.06);
  if (!tub && s.bed) tub = tubFor(s.bed.t0, s.bed.t1, s.bed.wall, 0.04);
  if (!tub) pts.push([0, top + 0.01]);
  return pts;
}

/** The lofted lower body as an indexed geometry with smooth normals. */
function lowerBody(s: BodyShape, f: Frame): BufferGeometry {
  const S = 40;
  const rings: Array<Array<[number, number]>> = [];
  for (let i = 0; i <= S; i++) rings.push(section(s, f, i / S));
  // All rings must have the same point count: pad shorter ones by repeating the last point.
  const half = Math.max(...rings.map((r) => r.length));
  for (const r of rings) while (r.length < half) r.splice(r.length - 1, 0, [...r[r.length - 2]!] as [number, number]);
  const ringN = half * 2 - 2; // mirrored, sharing the two centre points
  const pos: number[] = [];
  for (let i = 0; i <= S; i++) {
    const z = f.z(i / S);
    const r = rings[i]!;
    for (let j = 0; j < half; j++) pos.push(r[j]![0], r[j]![1], z);
    for (let j = half - 2; j >= 1; j--) pos.push(-r[j]![0], r[j]![1], z);
  }
  const idx: number[] = [];
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < ringN; j++) {
      const a = i * ringN + j, b = i * ringN + ((j + 1) % ringN);
      const c = (i + 1) * ringN + ((j + 1) % ringN), d = (i + 1) * ringN + j;
      // Ring runs bottom → top on the right, so (a, b, c) faces outward.
      idx.push(a, b, c, a, c, d);
    }
  }
  // Nose and tail caps (fans to the ring centre).
  for (const i of [0, S]) {
    const cx = 0;
    let cy = 0;
    const z = f.z(i / S);
    for (let j = 0; j < ringN; j++) cy += pos[(i * ringN + j) * 3 + 1]!;
    cy /= ringN;
    const centre = pos.length / 3;
    pos.push(cx, cy, z);
    for (let j = 0; j < ringN; j++) {
      const a = i * ringN + j, b = i * ringN + ((j + 1) % ringN);
      if (i === 0) idx.push(centre, b, a);
      else idx.push(centre, a, b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Cabin glass, pillars and roof. */
function greenhouse(b: MeshBuilder, s: BodyShape, f: Frame, paint: boolean): void {
  const c = s.cabin;
  const roofY = s.height;
  const yTop = (t: number) => {
    if (t <= c.roofStart) return f.belt(c.start) + (roofY - f.belt(c.start)) * smoothstep(c.start, c.roofStart, t) ** 0.9;
    if (t >= c.roofEnd) return f.belt(c.end) + (roofY - f.belt(c.end)) * (1 - smoothstep(c.roofEnd, c.end, t)) ** 0.9;
    return roofY + 0.015 * Math.sin(((t - c.roofStart) / (c.roofEnd - c.roofStart)) * Math.PI);
  };
  const N = 14;
  const glass = () => b.surface('#1C2A33', 0.04, 0, 0, SurfFlag.GLASS | SurfFlag.WET);
  for (let i = 0; i < N; i++) {
    const t0 = c.start + ((c.end - c.start) * i) / N, t1 = c.start + ((c.end - c.start) * (i + 1)) / N;
    const z0 = f.z(t0), z1 = f.z(t1);
    const b0 = f.belt(t0) - 0.01, b1 = f.belt(t1) - 0.01;
    const y0 = yTop(t0), y1 = yTop(t1);
    const w0 = f.hw(t0) - 0.05, w1 = f.hw(t1) - 0.05;
    const tw0 = w0 * (1 - c.tumblehome), tw1 = w1 * (1 - c.tumblehome);
    const onRoof = t0 >= c.roofStart - 0.005 && t1 <= c.roofEnd + 0.005;
    // Sides (glass), mirrored.
    glass();
    b.quad([w1, b1, z1], [w0, b0, z0], [tw0, y0, z0], [tw1, y1, z1]);
    b.quad([-w0, b0, z0], [-w1, b1, z1], [-tw1, y1, z1], [-tw0, y0, z0]);
    // Top: roof panel (paint) or windshield / rear glass.
    if (onRoof) {
      if (paint) b.surface('#FFFFFF', 0.3, 0.35, 0, PAINT);
      else b.surface('#E8E2D8', 0.85, 0, 0, SurfFlag.WET);
    } else glass();
    b.quad([tw1, y1, z1], [tw0, y0, z0], [-tw0, y0, z0], [-tw1, y1, z1]);
  }
  // Pillars: A at the windshield base edges, B mid-cabin, C at the rear (paint strips just outside the glass).
  b.surface('#FFFFFF', 0.3, 0.35, 0, PAINT);
  const pillar = (t: number, wTop: number) => {
    const z = f.z(t);
    const by = f.belt(t), ty = yTop(t);
    const w = f.hw(t) - 0.04, tw = w * (1 - c.tumblehome);
    for (const sx of [1, -1]) {
      const p0: [number, number, number] = [sx * (w + 0.005), by, z - wTop];
      const p1: [number, number, number] = [sx * (w + 0.005), by, z + wTop];
      const p2: [number, number, number] = [sx * (tw + 0.005), ty, z + wTop];
      const p3: [number, number, number] = [sx * (tw + 0.005), ty, z - wTop];
      if (sx > 0) b.quad(p1, p0, p3, p2);
      else b.quad(p0, p1, p2, p3);
    }
  };
  pillar(c.start + 0.012, 0.035);
  pillar((c.roofStart + c.roofEnd) / 2, 0.05);
  pillar(c.end - 0.02, 0.07);
}

function convertibleCockpit(b: MeshBuilder, s: BodyShape, f: Frame): void {
  const c = s.cabin;
  const floorY = f.belt((c.start + c.end) / 2) - 0.52;
  // Windshield with a chrome frame.
  const t0 = c.start, t1 = c.start + 0.07;
  const z0 = f.z(t0), z1 = f.z(t1);
  const w = f.hw(t0) - 0.08;
  const yb = f.belt(t0), yt = s.height;
  b.surface('#2A3A44', 0.04, 0, 0, SurfFlag.GLASS);
  b.quad([w, yb, z0], [w * 0.92, yt, z1], [-w * 0.92, yt, z1], [-w, yb, z0]);
  b.quad([-w, yb, z0], [-w * 0.92, yt, z1], [w * 0.92, yt, z1], [w, yb, z0]);
  b.surface('#EEF1F4', 0.12, 1, 0, SurfFlag.WET);
  b.tube([new Vector3(w, yb, z0), new Vector3(w * 0.92, yt, z1), new Vector3(-w * 0.92, yt, z1), new Vector3(-w, yb, z0)], 0.025, 5);
  // Dash, then seats under each hip point and the wheel where a driver's hands fall
  // (characters/ergonomics), so seated people line up with the cockpit.
  b.surface('#6B3F2A', 0.45, 0, 0, 0);
  b.box(0, yb - 0.08, z1 + 0.13, w * 1.85, 0.16, 0.24);
  b.surface('#F2E6D6', 0.6, 0, 0, 0);
  const hp = seatPoint(s);
  for (const sx of [-1, 1]) {
    const x = sx * Math.abs(hp.x);
    const top = hp.y - SEAT_CUSHION.below;
    const back = hp.z + SEAT_CUSHION.back + 0.07;
    b.box(x, (top + floorY) / 2, hp.z - 0.07, 0.5, Math.max(0.04, top - floorY), 0.5);
    b.box(x, top + 0.3, back, 0.5, 0.6, 0.12);
    b.box(x, top + 0.68, back + 0.02, 0.26, 0.18, 0.1);
  }
  b.surface('#1A1C22', 0.5, 0.2, 0, 0);
  const wx = hp.x, wy = hp.y + DRIVER_WHEEL.y, wz = hp.z + DRIVER_WHEEL.z;
  const ct = Math.cos(DRIVER_WHEEL.tilt), st = Math.sin(DRIVER_WHEEL.tilt);
  const ring: Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const gx = Math.cos(a) * DRIVER_WHEEL.radius, gy = Math.sin(a) * DRIVER_WHEEL.radius;
    ring.push(new Vector3(wx + gx, wy + gy * ct, wz + gy * st));
  }
  b.tube(ring, 0.016, 5);
  b.tube([new Vector3(wx, wy - 0.06, wz - 0.16), new Vector3(wx, wy, wz)], 0.022, 6);
}

function pickupBed(b: MeshBuilder, s: BodyShape, f: Frame): void {
  const bed = s.bed!;
  const floorY = f.belt((bed.t0 + bed.t1) / 2) - bed.wall;
  b.surface('#3A3530', 0.9, 0.1, 0, SurfFlag.WET);
  const w = f.hw(0.75) - 0.12;
  b.quad([w, floorY + 0.01, f.z(bed.t0)], [-w, floorY + 0.01, f.z(bed.t0)], [-w, floorY + 0.01, f.z(bed.t1)], [w, floorY + 0.01, f.z(bed.t1)]);
  // Tailgate handle and a toolbox across the front of the bed.
  b.surface('#C9CDD2', 0.25, 0.9, 0, SurfFlag.WET);
  b.box(0, floorY + 0.25, f.z(bed.t0) + 0.25, w * 1.9, 0.4, 0.4);
}

function lights(b: MeshBuilder, s: BodyShape, f: Frame): void {
  const zF = f.z(0) - 0.005, zR = f.z(1) + 0.005;
  const hw = f.hw(0.02);
  const yH = f.belt(0.02) - 0.12;
  b.surface('#FFF6E4', 0.15, 0, 1.2, CarFlag.HEADLIGHT);
  if (s.headlights === 'round' || s.headlights === 'quad') {
    const xs = s.headlights === 'round' ? [hw - 0.24] : [hw - 0.2, hw - 0.42];
    for (const x of xs) for (const sx of [1, -1]) disc(b, sx * x, yH, zF, s.headlights === 'round' ? 0.115 : 0.085);
  } else {
    for (const sx of [1, -1]) b.box(sx * (hw - 0.3), yH + 0.02, zF + 0.02, 0.42, 0.09, 0.04);
  }
  // Grille.
  b.surface('#17191E', 0.5, 0.4, 0, SurfFlag.WET);
  b.box(0, yH - 0.05, zF + 0.015, Math.max(0.5, hw * 2 - (s.headlights === 'quad' ? 1.05 : 0.8)), 0.22, 0.03);
  // Tail lights.
  const yT = f.belt(0.97) - 0.13;
  const hr = f.hw(0.98);
  b.surface('#FF2236', 0.25, 0, 0.6, CarFlag.TAILLIGHT);
  for (const sx of [1, -1]) {
    if (s.fins) disc(b, sx * (hr - 0.2), yT, zR, 0.08, true);
    else b.box(sx * (hr - 0.26), yT, zR - 0.015, 0.36, 0.1, 0.04);
  }
  // Plates.
  b.surface('#F4F2EC', 0.6, 0, 0, SurfFlag.WET);
  b.box(0, s.clearance + 0.32, zR - 0.01, 0.52, 0.12, 0.03);
  b.box(0, s.clearance + 0.3, zF + 0.01, 0.52, 0.12, 0.03);
}

function disc(b: MeshBuilder, x: number, y: number, z: number, r: number, rear = false): void {
  const n = 14;
  const nz = rear ? 1 : -1;
  const c = b.vertex(x, y, z, 0, 0, nz, 0, 0);
  const first = b.vertices;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    b.vertex(x + Math.cos(a) * r, y + Math.sin(a) * r, z, 0, 0, nz, 0, 0);
  }
  for (let i = 0; i < n; i++) {
    if (rear) b.triangle(c, first + i, first + i + 1);
    else b.triangle(c, first + i + 1, first + i);
  }
}

function trim(b: MeshBuilder, s: BodyShape, f: Frame, paint: boolean): void {
  const zF = f.z(0), zR = f.z(1);
  const hwF = f.hw(0.03), hwR = f.hw(0.97);
  const yB = s.clearance + 0.22;
  // Bumpers.
  if (s.chrome) b.surface('#EEF1F4', 0.1, 1, 0, SurfFlag.WET);
  else if (paint) b.surface('#FFFFFF', 0.35, 0.3, 0, PAINT);
  else b.surface('#2A2D33', 0.5, 0.2, 0, SurfFlag.WET);
  b.box(0, yB, zF - 0.05, hwF * 2 + 0.04, 0.16, 0.14);
  b.box(0, yB, zR + 0.05, hwR * 2 + 0.04, 0.16, 0.14);
  // Mirrors.
  if (paint) b.surface('#FFFFFF', 0.3, 0.35, 0, PAINT);
  const tm = s.cabin.start + 0.03;
  for (const sx of [1, -1]) b.box(sx * (f.hw(tm) + 0.08), f.belt(tm) + 0.12, f.z(tm), 0.12, 0.1, 0.16);
  // Exhausts.
  b.surface('#D8DCE0', 0.2, 1, 0, 0);
  const pipes = s.spoiler || s.fins ? [0.42, -0.42] : [0.42];
  for (const px of pipes) b.tube([new Vector3(px, s.clearance + 0.1, zR - 0.2), new Vector3(px, s.clearance + 0.1, zR + 0.1)], 0.045, 8);
  if (s.fins) {
    if (paint) b.surface('#FFFFFF', 0.3, 0.35, 0, PAINT);
    for (const sx of [1, -1]) {
      const x = sx * (hwR - 0.1);
      const y0 = f.belt(0.8), z0 = f.z(0.8), z1 = f.z(1);
      b.quad([x, y0, z0], [x, y0, z1], [x, y0 + 0.16, z1], [x, y0 + 0.02, z0]);
      b.quad([x, y0, z1], [x, y0, z0], [x, y0 + 0.02, z0], [x, y0 + 0.16, z1]);
    }
  }
  if (s.spoiler) {
    b.surface('#17191E', 0.4, 0.3, 0, SurfFlag.WET);
    const y = f.belt(0.95) + s.spoiler;
    for (const sx of [1, -1]) b.box(sx * (hwR - 0.3), y - s.spoiler / 2, f.z(0.95), 0.05, s.spoiler, 0.12);
    b.box(0, y, f.z(0.95), hwR * 2 - 0.2, 0.04, 0.32);
  }
}

/** Body geometry (paint, glass, trim, lights) in the vehicle frame: forward −Z, ground at y = 0. */
export function carBodyGeometry(def: VehicleDef): BufferGeometry {
  const s = def.body;
  const f = frame(s);
  const b = new MeshBuilder();
  const paint = def.cls !== 'police';
  b.surface('#FFFFFF', 0.28, 0.35, 0, PAINT);
  if (!paint) b.surface('#F4F0EA', 0.35, 0.2, 0, SurfFlag.WET);
  b.geometry(lowerBody(s, f));
  // Police two-tone: black lower doors and a lightbar.
  if (def.cls === 'police') {
    b.surface('#14161B', 0.4, 0.2, 0, SurfFlag.WET);
    const t0 = 0.3, t1 = 0.82;
    for (const sx of [1, -1]) {
      const x = sx * (f.hw(0.55) + 0.028);
      const yb = s.clearance + 0.12, yt = f.belt(0.55) - 0.22;
      const p = [[x, yb, f.z(t0)], [x, yb, f.z(t1)], [x, yt, f.z(t1)], [x, yt, f.z(t0)]] as const;
      if (sx > 0) b.quad(p[1], p[0], p[3], p[2]);
      else b.quad(p[0], p[1], p[2], p[3]);
    }
  }
  if (s.convertible) convertibleCockpit(b, s, f);
  else greenhouse(b, s, f, paint);
  if (s.bed) pickupBed(b, s, f);
  lights(b, s, f);
  trim(b, s, f, paint);
  if (def.cls === 'police') {
    const z = f.z((s.cabin.roofStart + s.cabin.roofEnd) / 2);
    b.surface('#1A1C22', 0.4, 0.3, 0, 0);
    b.box(0, s.height + 0.05, z, 1.2, 0.1, 0.3);
    b.surface('#FFFFFF', 0.2, 0, 4, CarFlag.SIREN);
    b.box(0.32, s.height + 0.14, z, 0.5, 0.1, 0.26);
    b.box(-0.32, s.height + 0.14, z, 0.5, 0.1, 0.26);
  }
  return b.build();
}

/** One wheel (tyre + rim) centred at the origin, axle along X. */
export function wheelGeometry(def: VehicleDef): BufferGeometry {
  const s = def.body;
  const R = s.wheelR, W = s.wheelW;
  const rimR = R * 0.64;
  const b = new MeshBuilder();
  // Tyre: rounded profile revolved around Y, then turned so the axle is X.
  b.surface('#1B1B20', 0.85, 0, 0, SurfFlag.WET);
  const prof: Array<[number, number]> = [[rimR, -W * 0.42]];
  for (let i = 0; i <= 10; i++) {
    const a = -Math.PI / 2 + (i / 10) * Math.PI;
    prof.push([rimR + (R - rimR) * (0.55 + 0.45 * Math.cos(a)), (W / 2) * Math.sin(a)]);
  }
  prof.push([rimR, W * 0.42]);
  b.lathe(0, 0, prof, 20);
  // Rim face and spokes on the outer side (+Y before rotation).
  b.surface(s.rimColor, s.rimStyle === 'steel' ? 0.45 : 0.15, s.rimStyle === 'steel' ? 0.4 : 0.95, 0, SurfFlag.WET);
  b.cylinder(0, W / 2 - 0.05, 0, rimR, rimR * 0.96, 0.04, 20, true);
  const spokes = s.rimStyle === 'wire' ? 18 : s.rimStyle === 'star' ? 5 : s.rimStyle === 'spokes' ? 7 : 0;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    const p0 = new Vector3(Math.cos(a) * rimR * 0.2, W / 2 - 0.01, Math.sin(a) * rimR * 0.2);
    const p1 = new Vector3(Math.cos(a + (s.rimStyle === 'wire' ? 0.5 : 0)) * rimR * 0.95, W / 2 - 0.03, Math.sin(a + (s.rimStyle === 'wire' ? 0.5 : 0)) * rimR * 0.95);
    b.tube([p0, p1], s.rimStyle === 'wire' ? 0.006 : 0.028, 4);
  }
  b.surface('#C9CDD2', 0.2, 0.9, 0, 0);
  b.cylinder(0, W / 2 - 0.02, 0, rimR * 0.22, rimR * 0.18, 0.04, 12, true);
  const g = b.build();
  g.rotateZ(-Math.PI / 2);
  return g;
}

/** Axle layout in the vehicle frame (forward −Z): [x, y, z] of each wheel centre at rest. */
export function wheelMounts(def: VehicleDef): Array<[number, number, number]> {
  const s = def.body;
  const f = frame(s);
  const x = s.track / 2;
  return [[x, s.wheelR, f.zf], [-x, s.wheelR, f.zf], [x, s.wheelR, f.zr], [-x, s.wheelR, f.zr]];
}
