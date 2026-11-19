import { AdditiveBlending, Color, Group, InstancedMesh, Matrix4, Mesh, Quaternion, ShaderMaterial, Vector3, type IUniform, type Material } from 'three';
import { Rng } from '@/core/rng';
import { LAYER_REFLECTED } from '@/render/layers';
import { MeshBuilder, SurfFlag, WinStyle } from '@/render/geo/MeshBuilder';
import type { MaterialKit } from '@/render/materials/MaterialKit';
import { ATMOSPHERE_GLSL, SHARED_PARS, type SharedUniforms } from '@/render/shared';
import { facade, outward, slab, type SignRequest } from '../buildings/kit';
import type { Poly } from '../geom';
import type { ChunkGrid, TrimeshAccumulator } from '../ChunkGrid';
import type { GlowCard } from '../props/streetProps';
import { addCapCollider } from '../roads/RoadMesher';
import { BOARDWALK_Y, PIER_Y, STRAND } from './Beachfront';

const HEAD_X0 = -1185;
const HEAD_X1 = STRAND.pierEnd;
const HEAD_HALF = 34;
export const WHEEL = { x: -1152, z: 0, hubY: PIER_Y + 30, radius: 26, gondolas: 24, period: 260 };

/** Static pier: ramp, deck on pilings, T-head, rails, lamps, arcade, entrance arch. */
export function buildPier(grid: ChunkGrid, col: TrimeshAccumulator, seed: number): { glows: GlowCard[]; signs: SignRequest[] } {
  const rng = new Rng(seed);
  const glows: GlowCard[] = [];
  const signs: SignRequest[] = [];
  const hw = STRAND.pierHalfW;
  const x0 = STRAND.boardwalkX;
  const rampEnd = x0 - 34;
  // Ramp up from the boardwalk.
  {
    const b = grid.at(x0 - 17, 0, 'city');
    b.surface('#A48D74', 0.88, 0, 0, SurfFlag.WET).windows(0.3, 0.3, WinStyle.DECK, 3);
    b.quad([x0, BOARDWALK_Y, -hw], [x0, BOARDWALK_Y, hw], [rampEnd, PIER_Y, hw], [rampEnd, PIER_Y, -hw]);
    b.noWindows();
    col.addQuad([x0, BOARDWALK_Y, -hw], [x0, BOARDWALK_Y, hw], [rampEnd, PIER_Y, hw], [rampEnd, PIER_Y, -hw]);
  }
  // Main deck and T-head in chunks.
  for (let x = rampEnd; x > HEAD_X1; x -= 60) {
    const xe = Math.max(HEAD_X1, x - 60);
    deck(grid, col, xe, x, -hw, hw);
  }
  deck(grid, col, HEAD_X0, HEAD_X1, -HEAD_HALF, HEAD_HALF);
  // Pilings.
  for (let x = rampEnd; x > HEAD_X0; x -= 8) {
    const inHead = x <= HEAD_X1;
    const zs = inHead ? [-30, -18, -6, 6, 18, 30] : [-hw + 0.6, hw - 0.6];
    const b = grid.at(x, 0, 'city');
    b.surface('#6E5A48', 0.9, 0, 0, SurfFlag.WET);
    for (const z of zs) b.cylinder(x, -6, z, 0.28, 0.24, PIER_Y - 0.3 + 6, 8, false);
  }
  // Rails along both sides and around the head.
  railLine(grid, rampEnd, -hw, HEAD_X1, -hw);
  railLine(grid, rampEnd, hw, HEAD_X1, hw);
  railLine(grid, HEAD_X1, -HEAD_HALF, HEAD_X0, -HEAD_HALF);
  railLine(grid, HEAD_X1, HEAD_HALF, HEAD_X0, HEAD_HALF);
  railLine(grid, HEAD_X0, -HEAD_HALF, HEAD_X0, HEAD_HALF);
  // Lamps.
  for (let x = rampEnd - 6; x > HEAD_X1; x -= 20) {
    for (const z of [-hw + 0.5, hw - 0.5]) {
      const b = grid.at(x, z, 'city');
      b.surface('#F2EFE8', 0.45, 0.5, 0, SurfFlag.WET);
      b.cylinder(x, PIER_Y, z, 0.07, 0.06, 3.8, 8, false);
      b.surface('#FFE7C2', 0.2, 0, 5, SurfFlag.NIGHT);
      b.sphere(x, PIER_Y + 4.0, z, 0.28, 10, 7);
      glows.push({ x, y: PIER_Y, z, radius: 5.5, color: '#FFD9A0', intensity: 0.5 });
    }
  }
  // Entrance arch over the pier at the boardwalk, with the big neon name.
  {
    const ax = x0 - 4;
    const b = grid.at(ax, 0, 'city');
    b.surface('#F7C3D2', 0.8, 0, 0, SurfFlag.WET);
    for (const z of [-hw - 0.4, hw + 0.4]) slab(b, [[ax + 0.8, z - 0.8], [ax - 0.8, z - 0.8], [ax - 0.8, z + 0.8], [ax + 0.8, z + 0.8]], BOARDWALK_Y, BOARDWALK_Y + 7.5);
    b.surface('#17C2B0', 0.7, 0, 0, SurfFlag.WET);
    slab(b, [[ax + 0.6, -hw - 1.4], [ax - 0.6, -hw - 1.4], [ax - 0.6, hw + 1.4], [ax + 0.6, hw + 1.4]], BOARDWALK_Y + 6.2, BOARDWALK_Y + 8.4);
    signs.push({
      text: 'PIER 9', kind: 'neon', font: 'deco', color: '#FF3D8B', accent: '#FFFFFF',
      position: new Vector3(ax + 0.65, BOARDWALK_Y + 7.3, 0), yaw: -Math.PI / 2, width: 9, height: 1.9, seed: 9,
    });
  }
  // Arcade and a snack stand on the head.
  arcade(grid, -1132, -24, 'Pier Pressure Arcade', '#FFD166', '#9C7BFF', signs, rng);
  arcade(grid, -1132, 24, 'Two Scoops Ahoy', '#FF8FB1', '#17C2B0', signs, rng);
  return { glows, signs };
}

function deck(grid: ChunkGrid, col: TrimeshAccumulator, x0: number, x1: number, z0: number, z1: number): void {
  const b = grid.at((x0 + x1) / 2, (z0 + z1) / 2, 'city');
  b.surface('#A48D74', 0.88, 0, 0, SurfFlag.WET).windows(0.3, 0.3, WinStyle.DECK, 6);
  slab(b, [[x1, z0], [x0, z0], [x0, z1], [x1, z1]], PIER_Y - 0.45, PIER_Y, true);
  b.noWindows();
  addCapCollider(col, [[x1, z0], [x0, z0], [x0, z1], [x1, z1]], PIER_Y);
}

function railLine(grid: ChunkGrid, x0: number, z0: number, x1: number, z1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.ceil(len / 2.4);
  const b = grid.at((x0 + x1) / 2, (z0 + z1) / 2, 'city');
  b.surface('#F4F0E8', 0.75, 0, 0, SurfFlag.WET);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    b.boxOn(x0 + (x1 - x0) * t, PIER_Y, z0 + (z1 - z0) * t, 0.1, 1.05, 0.1);
  }
  const yaw = Math.atan2(-(x1 - x0), -(z1 - z0));
  for (const h of [0.55, 1.02]) {
    b.pushTRS((x0 + x1) / 2, PIER_Y + h, (z0 + z1) / 2, yaw);
    b.box(0, 0, 0, 0.07, 0.06, len);
    b.pop();
  }
}

function arcade(grid: ChunkGrid, x: number, z: number, name: string, wall: string, accent: string, signs: SignRequest[], rng: Rng): void {
  const b = grid.at(x, z, 'city');
  const face = z < 0 ? 1 : -1; // open toward the centre of the head
  b.surface(wall, 0.85, 0, 0, SurfFlag.WET);
  const d = 7, w = 16;
  const zFront = z + face * (d / 2);
  const box: Poly = [[x + w / 2, z - d / 2], [x - w / 2, z - d / 2], [x - w / 2, z + d / 2], [x + w / 2, z + d / 2]];
  facade(b, outward(box), [{ y0: PIER_Y, y1: PIER_Y + 4.2, win: [4, 4.2, WinStyle.STOREFRONT, rng.int(1, 99)] }]);
  b.cap(outward(box), PIER_Y + 4.2, 1);
  b.surface(accent, 0.7, 0, 0, SurfFlag.WET);
  slab(b, [[x + w / 2 + 0.4, z - d / 2 - 0.4], [x - w / 2 - 0.4, z - d / 2 - 0.4], [x - w / 2 - 0.4, z + d / 2 + 0.4], [x + w / 2 + 0.4, z + d / 2 + 0.4]], PIER_Y + 4.2, PIER_Y + 4.6);
  signs.push({
    text: name, kind: 'neon', font: 'script', color: accent === '#9C7BFF' ? '#B8F54A' : '#FFD166', accent: '#FFFFFF',
    position: new Vector3(x, PIER_Y + 5.4, zFront + face * 0.05), yaw: face > 0 ? Math.PI : 0, width: 12, height: 1.6, seed: rng.int(1, 1e6),
  });
}

const RIM_VERT = /* glsl */ `
attribute vec4 surf;
varying float vAngle;
varying vec3 vWorld;
varying float vRing;
void main() {
  vAngle = surf.x;
  vRing = surf.y;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const RIM_FRAG = /* glsl */ `
${SHARED_PARS}
${ATMOSPHERE_GLSL}
varying float vAngle;
varying vec3 vWorld;
varying float vRing;
vec3 hue(float h) {
  vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
  return k * k * (3.0 - 2.0 * k);
}
void main() {
  float night = smoothstep(0.0, 0.8, uWeather.z);
  float t = uTime;
  // Chase lights running round the rim, colours drifting through the sunset palette.
  float chase = 0.35 + 0.65 * step(0.45, fract(vAngle * 6.0 - t * 0.9 + vRing * 0.5));
  vec3 c = mix(vec3(1.0, 0.24, 0.55), hue(fract(vAngle * 0.16 + t * 0.03)), 0.55);
  vec3 col = c * chase * mix(0.25, 6.0, night);
  col *= 1.0 - hhFogAmount(cameraPosition, vWorld);
  gl_FragColor = vec4(col, 1.0);
}
`;

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);

/**
 * The Ferris wheel: a slowly turning structure with chase-lit rims and gondolas that hang level.
 * Supports and the boarding platform are static; the wheel and gondolas update every frame.
 */
export class FerrisWheel {
  readonly group = new Group();
  private readonly wheel: Mesh;
  private readonly lights: Mesh;
  private readonly gondolas: InstancedMesh;
  private readonly materials: Material[] = [];
  private angle = 0;

  constructor(kit: MaterialKit, shared: SharedUniforms, grid: ChunkGrid) {
    const W = WHEEL;
    this.group.name = 'ferris-wheel';
    // Static A-frame legs on both faces, into the chunk geometry.
    const sb = grid.at(W.x, W.z, 'city');
    sb.surface('#EDEFF2', 0.4, 0.6, 0, SurfFlag.WET);
    for (const dx of [-3.2, 3.2]) {
      for (const dz of [-16, 16]) sb.tube([new Vector3(W.x + dx, PIER_Y, W.z + dz), new Vector3(W.x + dx * 0.5, W.hubY, W.z)], 0.35, 8);
      sb.tube([new Vector3(W.x + dx, PIER_Y + 8, W.z - 12), new Vector3(W.x + dx, PIER_Y + 8, W.z + 12)], 0.18, 6);
    }
    sb.surface('#17C2B0', 0.6, 0.2, 0, SurfFlag.WET);
    sb.boxOn(W.x, PIER_Y, W.z - W.radius + 1, 9, 0.6, 6);

    // Rotating wheel (local frame centred on the hub; rotates about X).
    const b = new MeshBuilder();
    const r = W.radius;
    b.surface('#F7F3EC', 0.35, 0.55, 0, SurfFlag.WET);
    for (const x of [-1.8, 1.8]) {
      const ring: Vector3[] = [];
      for (let i = 0; i <= 96; i++) {
        const a = (i / 96) * Math.PI * 2;
        ring.push(new Vector3(x, Math.cos(a) * r, Math.sin(a) * r));
      }
      b.tube(ring, 0.22, 6);
      const inner: Vector3[] = ring.map((p) => p.clone().multiplyScalar(0.86).setX(x));
      b.tube(inner, 0.12, 5);
      for (let i = 0; i < W.gondolas; i++) {
        const a = (i / W.gondolas) * Math.PI * 2;
        b.tube([new Vector3(x * 0.4, 0, 0), new Vector3(x, Math.cos(a) * r, Math.sin(a) * r)], 0.07, 4);
      }
    }
    for (let i = 0; i < W.gondolas; i++) {
      const a = (i / W.gondolas) * Math.PI * 2;
      b.tube([new Vector3(-1.8, Math.cos(a) * r, Math.sin(a) * r), new Vector3(1.8, Math.cos(a) * r, Math.sin(a) * r)], 0.1, 5);
    }
    b.surface('#FF6FA3', 0.4, 0.3, 0, SurfFlag.WET);
    b.cylinder(0, -0.5, 0, 1.6, 1.6, 1, 16, true);
    const wheelMat = kit.uber();
    this.materials.push(wheelMat);
    this.wheel = new Mesh(b.build(), wheelMat);
    this.wheel.position.set(W.x, W.hubY, W.z);
    this.wheel.castShadow = true;
    this.wheel.layers.set(LAYER_REFLECTED);
    this.group.add(this.wheel);

    // Chase lights: a bead of light quads along both rims and the spokes' ends.
    const lb = new MeshBuilder();
    for (const [ring, x] of [[0, -1.95], [1, 1.95]] as const) {
      for (let i = 0; i < 144; i++) {
        const a = (i / 144) * Math.PI * 2;
        lb.color.setRGB(1, 1, 1);
        lb.rough = i / 144;
        lb.metal = ring;
        lb.emissive = 0;
        lb.flags = 0;
        lb.sphere(x, Math.cos(a) * (r + 0.3), Math.sin(a) * (r + 0.3), 0.16, 4, 3);
      }
    }
    const uniforms: Record<string, IUniform> = {};
    shared.attach(uniforms);
    const lightMat = new ShaderMaterial({ name: 'hh-wheel-lights', uniforms, vertexShader: RIM_VERT, fragmentShader: RIM_FRAG, fog: false, blending: AdditiveBlending, transparent: true, depthWrite: false });
    this.materials.push(lightMat);
    this.lights = new Mesh(lb.build(), lightMat);
    this.lights.layers.set(LAYER_REFLECTED);
    this.lights.renderOrder = 5;
    this.wheel.add(this.lights);

    // Gondolas: candy-coloured cabins that stay level.
    const gb = new MeshBuilder({ windows: true });
    gb.surface('#FFFFFF', 0.5, 0.2, 0, SurfFlag.WET).windows(0.9, 1.6, WinStyle.BAND, 3);
    gb.boxOn(0, -2.6, 0, 2.4, 1.9, 2.0);
    gb.noWindows();
    gb.surface('#FFFFFF', 0.5, 0.3, 0, SurfFlag.WET);
    gb.boxOn(0, -0.7, 0, 2.6, 0.25, 2.2);
    gb.cylinder(0, -0.7, 0, 0.05, 0.05, 0.7, 5, false);
    const gMat = kit.uber({ facade: true });
    this.materials.push(gMat);
    this.gondolas = new InstancedMesh(gb.build(), gMat, W.gondolas);
    const cols = ['#FF6FA3', '#17C2B0', '#FFD166', '#9C7BFF', '#FF8A5C', '#5FB8FF', '#B8F54A', '#FF3D8B'];
    const c = new Color();
    for (let i = 0; i < W.gondolas; i++) this.gondolas.setColorAt(i, c.set(cols[i % cols.length]!));
    this.gondolas.castShadow = true;
    this.gondolas.frustumCulled = false;
    this.gondolas.layers.set(LAYER_REFLECTED);
    this.group.add(this.gondolas);
    this.update(0);
  }

  update(dt: number): void {
    const W = WHEEL;
    this.angle += (dt * Math.PI * 2) / W.period;
    this.wheel.rotation.x = this.angle;
    this.wheel.updateMatrixWorld();
    _q.identity();
    for (let i = 0; i < W.gondolas; i++) {
      const a = (i / W.gondolas) * Math.PI * 2 + this.angle;
      // Rotation about +X maps (y, z) → (y cos a − z sin a, y sin a + z cos a).
      _p.set(W.x, W.hubY + Math.cos(a) * W.radius, W.z + Math.sin(a) * W.radius);
      _m.compose(_p, _q, _s);
      this.gondolas.setMatrixAt(i, _m);
    }
    this.gondolas.instanceMatrix.needsUpdate = true;
  }

  dispose(kit: MaterialKit): void {
    this.wheel.geometry.dispose();
    this.lights.geometry.dispose();
    this.gondolas.geometry.dispose();
    for (const m of this.materials) {
      if (m instanceof ShaderMaterial) m.dispose();
      else kit.release(m);
    }
  }
}
