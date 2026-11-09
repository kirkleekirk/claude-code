// Vehicle models: a pickup, a sedan and a wood-panelled station wagon.
// Bodies are side profiles extruded across the width with rounded edges and
// real wheel arches; the cabins are open (roof, pillars and glass) so you see
// the seats and whoever is driving. Each car is one opaque mesh, told apart
// into paint, chrome, rubber, lenses, wood and so on by a tiny region texture
// (roughness, metalness, clearcoat, lamp glow), plus one glass mesh; the four
// wheels are one instanced mesh.
//
// Model space: +z forward, +y up, +x to the driver's (left) side; the origin
// is on the ground midway between the axles.
import * as THREE from 'three';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------- material regions ----------------
// region i sits at u = (i + 0.5) / 16. R: clearcoat, G: roughness, B: metalness
const REGIONS = {
  paint: { i: 0, rough: 0.42, metal: 0.12, coat: 1 },
  chrome: { i: 1, rough: 0.12, metal: 1.0, coat: 0 },
  rubber: { i: 2, rough: 0.85, metal: 0.0, coat: 0 },
  interior: { i: 3, rough: 0.92, metal: 0.0, coat: 0 },
  head: { i: 4, rough: 0.12, metal: 0.55, coat: 0.6, emit: [1.0, 0.94, 0.8] },
  tail: { i: 5, rough: 0.2, metal: 0.05, coat: 0.6, emit: [1.0, 0.05, 0.03] },
  grille: { i: 6, rough: 0.6, metal: 0.4, coat: 0 },
  plate: { i: 7, rough: 0.55, metal: 0.1, coat: 0 },
  wood: { i: 8, rough: 0.6, metal: 0.0, coat: 0.5 },
  tire: { i: 9, rough: 0.94, metal: 0.0, coat: 0 },
  rim: { i: 10, rough: 0.3, metal: 0.9, coat: 0 },
  under: { i: 11, rough: 1.0, metal: 0.0, coat: 0 },
  amber: { i: 12, rough: 0.2, metal: 0.05, coat: 0.6, emit: [1.0, 0.5, 0.06] },
  trim: { i: 13, rough: 0.5, metal: 0.0, coat: 0.3 },
};
const COLORS = {
  chrome: '#d9dcdf', rubber: '#1d1d1d', interior: '#3a332c', head: '#e8e6dc', tail: '#9c1416', grille: '#1b1b1b',
  plate: '#e6e1cf', wood: '#80532f', tire: '#151515', rim: '#b9bcbf', under: '#101010', amber: '#d97a12', trim: '#d6ccb2',
};

let regionTex = null;
function regionTextures() {
  if (regionTex) return regionTex;
  const rm = new Uint8Array(16 * 4), em = new Uint8Array(16 * 4);
  for (const r of Object.values(REGIONS)) {
    rm.set([Math.round(r.coat * 255), Math.round(r.rough * 255), Math.round(r.metal * 255), 255], r.i * 4);
    const e = r.emit || [0, 0, 0];
    em.set([Math.round(e[0] * 255), Math.round(e[1] * 255), Math.round(e[2] * 255), 255], r.i * 4);
  }
  const mk = (d, srgb) => {
    const t = new THREE.DataTexture(d, 16, 1);
    t.magFilter = t.minFilter = THREE.NearestFilter;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  regionTex = { rm: mk(rm, false), em: mk(em, true) };
  return regionTex;
}

// The car-body material: per-vertex colours for the fixed parts, the paint
// colour from a uniform (so every car of a model shares one geometry), and
// procedural wear (mud low down, rust on old paint) and woodgrain.
const NOISE = `
float hfH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float hfN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hfH(i), hfH(i + vec3(1,0,0)), f.x), mix(hfH(i + vec3(0,1,0)), hfH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hfH(i + vec3(0,0,1)), hfH(i + vec3(1,0,1)), f.x), mix(hfH(i + vec3(0,1,1)), hfH(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
// cheap: phones get the same look without the clearcoat layer
export function carMaterial({ paint = '#888888', wear = 0.15, seed = 0, cheap = false } = {}) {
  const t = regionTextures();
  const base = { vertexColors: true, roughness: 1, metalness: 1, roughnessMap: t.rm, metalnessMap: t.rm, emissive: 0x000000, emissiveMap: t.em, envMapIntensity: 1.0 };
  const m = cheap ? new THREE.MeshStandardMaterial(base) : new THREE.MeshPhysicalMaterial({ ...base, clearcoat: 1, clearcoatRoughness: 0.08, clearcoatMap: t.rm });
  const u = m.userData.u = {
    uPaint: { value: new THREE.Color(paint) }, uWear: { value: wear }, uSeed: { value: seed },
    uHead: { value: 0 }, uTail: { value: 0 }, uAmber: { value: 0 },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPaint;\nvarying float vPaint;\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaint = aPaint; vObj = transformed;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec3 uPaint; uniform float uWear; uniform float uSeed; uniform float uHead; uniform float uTail; uniform float uAmber;
varying float vPaint; varying vec3 vObj;
${NOISE}`)
      .replace('#include <color_fragment>', `
float hfRegion = floor(vRoughnessMapUv.x * 16.0);
vec3 hfBase = mix(vColor, uPaint, vPaint);
vec3 sp = vObj + uSeed * 7.31;
float hfNz = hfN(sp * 2.3) * 0.6 + hfN(sp * 7.9) * 0.3 + hfN(sp * 23.0) * 0.1;
// mud splashed up from the wheels, thicker low down
float hfDirt = clamp((uWear * 0.75 + 0.12) * (1.0 - smoothstep(0.25, 0.95, vObj.y + hfNz * 0.35)), 0.0, 0.85);
// rust eats old paint along the bottom edges and in blotches
float hfRust = vPaint * smoothstep(0.6, 0.8, hfNz + uWear * 0.4 + (1.0 - smoothstep(0.3, 0.8, vObj.y)) * uWear * 0.3 - 0.3) * step(0.25, uWear);
vec3 hfRustCol = mix(vec3(0.2, 0.1, 0.05), vec3(0.36, 0.19, 0.08), hfN(sp * 31.0));
// old paint goes chalky and dark with grime before it rusts through
hfBase *= mix(1.0, 0.8 + 0.2 * hfN(sp * 5.0), vPaint * smoothstep(0.3, 0.9, uWear));
hfBase = mix(hfBase, hfRustCol, hfRust * 0.9);
// woodgrain on the wagon's panels
if (abs(hfRegion - 8.0) < 0.5) {
  // long grain running along the car, in planks
  float gr = sin(vObj.y * 110.0 + hfN(vec3(vObj.z * 1.7, vObj.y * 12.0, 0.0)) * 5.0 + hfN(vec3(vObj.z * 0.4, 0.0, 3.0)) * 3.0);
  float plank = hfN(vec3(floor(vObj.z * 1.6), floor(vObj.y * 9.0), 7.0));
  hfBase *= (0.8 + 0.2 * (0.5 + 0.5 * gr)) * (0.88 + 0.2 * plank);
}
hfBase = mix(hfBase, vec3(0.30, 0.25, 0.19), hfDirt * (1.0 - step(8.5, hfRegion) * step(hfRegion, 9.5) * 0.5));
diffuseColor.rgb *= hfBase;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.93, max(hfRust, hfDirt * 0.9));')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - max(hfRust, hfDirt * 0.8);')
      .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= (1.0 - hfRust) * (1.0 - hfDirt) * (1.0 - uWear * 0.55);\n#endif')
      .replace('#include <emissivemap_fragment>', `
#ifdef USE_EMISSIVEMAP
vec3 hfEm = texture2D(emissiveMap, vEmissiveMapUv).rgb;
float hfK = abs(hfRegion - 4.0) < 0.5 ? uHead : abs(hfRegion - 5.0) < 0.5 ? uTail : abs(hfRegion - 12.0) < 0.5 ? uAmber : 0.0;
totalEmissiveRadiance = hfEm * hfK;
#endif`);
  };
  m.customProgramCacheKey = () => 'holdfast-car';
  return m;
}
export function glassMaterial(grimy = false) {
  return new THREE.MeshStandardMaterial({
    color: grimy ? 0x3b3a30 : 0x0e171b, roughness: grimy ? 0.45 : 0.03, metalness: grimy ? 0 : 0.2,
    transparent: true, opacity: grimy ? 0.78 : 0.42, envMapIntensity: grimy ? 0.6 : 1.7,
    side: THREE.DoubleSide, depthWrite: false,
  });
}

// ---------------- geometry helpers ----------------
const shapeOf = (pts) => {
  const s = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
  s.closePath();
  return s;
};
// a side-view outline [[z, y], ...] extruded across x: total width w, centred
// on x0, its long edges rounded by `bevel` without growing the outline
function extrudeX(pts, w, bevel, x0 = 0, crease = 0.72, segs = 3) {
  const bs = bevel * 0.9, depth = Math.max(0.002, w - 2 * bevel);
  const g = new THREE.ExtrudeGeometry(shapeOf(pts), {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bs, bevelOffset: -bs, bevelSegments: segs, curveSegments: 8,
  });
  g.rotateY(-Math.PI / 2); // shape x -> z, extrusion -> -x
  g.translate(depth / 2 + x0, 0, 0);
  return toCreasedNormals(g, crease);
}
// a rounded rectangle in the side view (d long in z, h tall), w wide in x
function roundRect(d, h, r, z, y) {
  r = Math.min(r, d / 2 - 0.001, h / 2 - 0.001);
  const pts = [], seg = r > 0.045 ? 4 : r > 0.015 ? 2 : 1;
  const corner = (cz, cy, a0) => { for (let k = 0; k <= seg; k++) { const a = a0 + (k / seg) * Math.PI / 2; pts.push([cz + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(z + d / 2 - r, y + h / 2 - r, 0);
  corner(z - d / 2 + r, y + h / 2 - r, Math.PI / 2);
  corner(z - d / 2 + r, y - h / 2 + r, Math.PI);
  corner(z + d / 2 - r, y - h / 2 + r, Math.PI * 1.5);
  return pts;
}
// mirror-flip a geometry's faces (for liners seen from inside)
function flipFaces(g) {
  g = g.index ? g.toNonIndexed() : g;
  for (const name of ['position', 'normal', 'uv']) {
    const a = g.attributes[name];
    if (!a) continue;
    const s = a.itemSize, arr = a.array;
    for (let i = 0; i < a.count; i += 3) for (let q = 0; q < s; q++) { const t = arr[(i + 1) * s + q]; arr[(i + 1) * s + q] = arr[(i + 2) * s + q]; arr[(i + 2) * s + q] = t; }
  }
  const n = g.attributes.normal.array;
  for (let i = 0; i < n.length; i++) n[i] = -n[i];
  return g;
}

class Parts {
  constructor() { this.list = []; this.glass = []; }
  add(geo, region, color = null, paint = false) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count, u = (REGIONS[region].i + 0.5) / 16;
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
    const c = new THREE.Color(color || COLORS[region] || '#ffffff');
    for (let k = 0; k < n; k++) { uv[k * 2] = u; uv[k * 2 + 1] = 0.5; col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b; }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aPaint', new THREE.BufferAttribute(new Float32Array(n).fill(paint ? 1 : 0), 1));
    this.list.push(g);
    return g;
  }
  // the body colour
  paint(geo) { return this.add(geo, 'paint', '#ffffff', true); }
  box(w, h, d, x, y, z, region, color, rx = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx) g.rotateX(rx);
    g.translate(x, y, z);
    return region === 'paint' ? this.paint(g) : this.add(g, region, color);
  }
  // a rounded block: d long (z), h tall, w wide (x)
  block(w, h, d, r, x, y, z, region, color, bevel = 0.008) {
    // small parts: one bevel step is plenty
    const g = extrudeX(roundRect(d, h, r, z, y), w, Math.min(bevel, w / 2 - 0.001), x, 0.72, bevel > 0.012 ? 2 : 1);
    return region === 'paint' ? this.paint(g) : this.add(g, region, color);
  }
  // a cylinder lying along x (a fuel door) or z
  disc(r, len, x, y, z, region, color, seg = 18, alongX = true) {
    const g = new THREE.CylinderGeometry(r, r, len, seg);
    if (alongX) g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
    g.translate(x, y, z);
    return region === 'paint' ? this.paint(g) : this.add(g, region, color);
  }
  // a flat polygon in the side plane at x, facing +x (facing > 0) or -x
  sidePoly(pts, x, facing, region, color) {
    return this.add(this.flatSide(pts, x, facing), region, color);
  }
  flatSide(pts, x, facing) {
    const g = new THREE.ShapeGeometry(shapeOf(pts)).toNonIndexed();
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) p.setXYZ(k, x, p.getY(k), p.getX(k));
    // swapping x and z mirrors the shape, so it now faces -x
    if (facing > 0) {
      const a = p.array;
      for (let i = 0; i < p.count; i += 3) for (let q = 0; q < 3; q++) { const t = a[(i + 1) * 3 + q]; a[(i + 1) * 3 + q] = a[(i + 2) * 3 + q]; a[(i + 2) * 3 + q] = t; }
    }
    g.deleteAttribute('normal'); g.deleteAttribute('uv');
    g.computeVertexNormals();
    return g;
  }
  glassSide(pts, x) { for (const s of [1, -1]) this.glass.push(this.flatSide(pts, s * x, s)); }
  // a pane spanning the width between two profile points (windscreen)
  glassAcross(a, b, halfW, inset = 0.012) {
    const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy) || 1;
    const nz = dy / L, ny = -dz / L; // outward, for points walked front to back
    const A = [a[0] - nz * inset, a[1] - ny * inset], B = [b[0] - nz * inset, b[1] - ny * inset];
    const P = [halfW, A[1], A[0], -halfW, A[1], A[0], -halfW, B[1], B[0], halfW, A[1], A[0], -halfW, B[1], B[0], halfW, B[1], B[0]];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) * ny + g.attributes.normal.getZ(0) * nz < 0) flipFaces(g);
    this.glass.push(g);
  }
  glassPlane(w, h, x, y, z, ry = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.glass.push(g.toNonIndexed());
  }
  build() {
    const merge = (list, names) => {
      let n = 0;
      for (const g of list) n += g.attributes.position.count;
      const out = new THREE.BufferGeometry();
      for (const name of names) {
        const size = list[0].attributes[name].itemSize, arr = new Float32Array(n * size);
        let o = 0;
        for (const g of list) { arr.set(g.attributes[name].array, o); o += g.attributes.position.count * size; }
        out.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      out.computeBoundingSphere(); out.computeBoundingBox();
      return out;
    };
    const opaque = merge(this.list, ['position', 'normal', 'uv', 'color', 'aPaint']);
    const glass = this.glass.length ? merge(this.glass.map((g) => (g.index ? g.toNonIndexed() : g)), ['position', 'normal']) : null;
    return { opaque, glass };
  }
}

// the bottom edge of a body panel, rear to front, cut up around the wheels
function sill(z0, z1, y, axles, archR, wheelY) {
  const pts = [[z0, y]];
  const a0 = Math.asin(Math.max(-1, Math.min(1, (y - wheelY) / archR)));
  for (const az of axles) {
    if (az - archR < z0 || az + archR > z1) continue;
    for (let k = 0; k <= 14; k++) {
      const a = Math.PI - a0 - (k / 14) * (Math.PI - 2 * a0);
      pts.push([az + Math.cos(a) * archR, wheelY + Math.sin(a) * archR]);
    }
  }
  pts.push([z1, y]);
  return pts;
}
// dark wheel-well liners inside each arch
function wells(P, axles, archR, wheelY, w) {
  for (const az of axles) {
    const g = new THREE.CylinderGeometry(archR - 0.004, archR - 0.004, w, 18, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2); g.translate(0, wheelY, az);
    P.add(flipFaces(g), 'under');
  }
}
// thin dark gaps where doors meet, and chrome handles
function seam(P, z, y0, y1, hw) { for (const s of [1, -1]) P.box(0.004, y1 - y0, 0.012, s * (hw + 0.001), (y0 + y1) / 2, z, 'rubber', '#0c0c0c'); }
function handle(P, z, y, hw) { for (const s of [1, -1]) P.block(0.025, 0.034, 0.17, 0.012, s * (hw + 0.012), y, z, 'chrome'); }
function strip(P, z0, z1, y, hw, region = 'rubber', h = 0.045) { for (const s of [1, -1]) P.block(0.022, h, z1 - z0, 0.01, s * (hw + 0.008), y, (z0 + z1) / 2, region); }
function mirrors(P, z, y, hw, big = false) {
  for (const s of [1, -1]) {
    P.box(0.07, 0.05, 0.08, s * (hw + 0.035), y - 0.05, z, 'rubber');
    P.block(big ? 0.2 : 0.15, big ? 0.22 : 0.12, 0.07, 0.025, s * (hw + (big ? 0.15 : 0.11)), y, z - 0.01, big ? 'chrome' : 'paint', null, 0.02);
    P.box(big ? 0.17 : 0.12, big ? 0.18 : 0.09, 0.004, s * (hw + (big ? 0.15 : 0.11)), y, z - 0.05, 'chrome');
  }
}
// a fuel filler door on the passenger side: just its shut lines
function fuelDoor(P, z, y, hw) {
  for (const [dy, dz, h, d] of [[0.065, 0, 0.006, 0.14], [-0.065, 0, 0.006, 0.14], [0, 0.07, 0.136, 0.006], [0, -0.07, 0.136, 0.006]]) P.box(0.004, h, d, -(hw + 0.001), y + dy, z + dz, 'rubber', '#101010');
}
function plate(P, z, y, face) { P.box(0.36, 0.13, 0.012, 0, y, z + face * 0.006, 'plate'); P.box(0.3, 0.025, 0.014, 0, y + 0.015, z + face * 0.007, 'plate', '#2b4a7a'); }

// The greenhouse: roof, pillars and glass over the body's beltline.
// c: { ws: [base, top], roof: [...] (front to back), rear: [top, base],
//      half, belt (beltline y at the windows), posts: [{ z, w, lean, top }],
//      rearPillar: polygon (side view), windows: [polygons] }
function greenhouse(P, c) {
  const t = 0.075, half = c.half, px = half - t / 2;
  // roof shell
  const top = [c.ws[1], ...c.roof, c.rear[0]];
  const bot = top.map(([z, y]) => [z, y - (c.roofT || 0.075)]).reverse();
  P.paint(extrudeX([...top, ...bot], half * 2, 0.03));
  // A pillars along the windscreen, the rear pillar (sedan C / wagon D / truck cab back)
  const band = (a, b, th) => {
    const dz = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dz, dy) || 1, nz = dy / L, ny = -dz / L;
    return [a, b, [b[0] - nz * th, b[1] - ny * th], [a[0] - nz * th, a[1] - ny * th]];
  };
  for (const s of [1, -1]) {
    P.paint(extrudeX(band(c.ws[0], c.ws[1], 0.065), t, 0.014, s * px, 0.72, 2));
    if (c.rearPillar) P.paint(extrudeX(c.rearPillar, t, 0.014, s * px, 0.72, 2));
    for (const q of c.posts || []) {
      const lean = q.lean || 0, y0 = c.belt - 0.06, y1 = q.top;
      P.paint(extrudeX([[q.z + q.w / 2, y0], [q.z + q.w / 2 + lean, y1], [q.z - q.w / 2 + lean, y1], [q.z - q.w / 2, y0]], t, 0.012, s * px, 0.72, 2));
    }
  }
  P.glassAcross(c.ws[0], c.ws[1], half - 0.03);
  if (c.rearGlass !== false) P.glassAcross(c.rear[0], c.rear[1], half - 0.03);
  for (const w of c.windows) P.glassSide(w, px);
  // rubber seals round the side glass read as window frames
  for (const w of c.windows) for (const s of [1, -1]) {
    for (let i = 0; i < w.length; i++) {
      const a = w[i], b = w[(i + 1) % w.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 0.05) continue;
      const g = new THREE.BoxGeometry(0.016, 0.018, L);
      g.rotateX(-Math.atan2(b[1] - a[1], b[0] - a[0]));
      g.translate(s * (half + 0.002), (a[1] + b[1]) / 2, (a[0] + b[0]) / 2);
      P.add(g, 'rubber', '#141414');
    }
  }
}
// seats, dash and steering wheel, seen through the glass
function cabin(P, o) {
  const { belt, floor, half, front, rear, ws } = o;
  // where the windscreen is at height y (the dash tucks in under it)
  const wsZ = (y) => ws[0][0] + (ws[1][0] - ws[0][0]) * ((y - ws[0][1]) / (ws[1][1] - ws[0][1]));
  // the tops of the door cards and the floor, in trim colour, laid over the
  // body's top line so no paint shows through the windows
  const top = o.top;
  P.add(extrudeX([...top.map(([z, y]) => [z, y + 0.012]), ...top.slice().reverse().map(([z, y]) => [z, y - 0.03])], half * 2 - 0.04, 0), 'interior', '#2c2723');
  const dz = wsZ(belt + 0.09) - 0.05;
  P.block(half * 2 - 0.1, 0.17, 0.38, 0.06, 0, belt + 0.005, dz - 0.19, 'interior', '#262220');
  // gauges hood and steering wheel on the driver's side
  const gz = wsZ(belt + 0.15) - 0.07;
  P.block(0.42, 0.07, 0.16, 0.03, half - 0.42, belt + 0.11, gz - 0.08, 'interior', '#1e1b19');
  const ring = new THREE.TorusGeometry(0.19, 0.022, 6, 20);
  ring.rotateX(-0.55); ring.translate(half - 0.42, belt + 0.06, gz - 0.36);
  P.add(ring, 'rubber', '#151515');
  P.box(0.04, 0.04, 0.2, half - 0.42, belt + 0.02, gz - 0.27, 'rubber', '#151515', -0.5);
  for (const row of o.rows) {
    const xs = row.bench ? [0] : [half - 0.42, -(half - 0.42)];
    const w = row.bench ? half * 2 - 0.16 : 0.52;
    for (const sx of xs) {
      P.block(w, 0.16, 0.5, 0.06, sx, floor + 0.08, row.z + 0.04, 'interior', o.seat);
      // the back, leaning a little
      const back = extrudeX(roundRect(0.13, 0.62, 0.05, 0, 0), w, 0.03, sx, 0.72, 2);
      back.rotateX(-0.2); back.translate(0, floor + 0.44, row.z - 0.24);
      P.add(back, 'interior', o.seat);
      if (row.heads) for (const hx of row.bench ? [half - 0.42, -(half - 0.42)] : [sx]) P.block(0.24, 0.17, 0.09, 0.05, hx, floor + 0.84, row.z - 0.33, 'interior', o.seat);
    }
  }
}

// ---------------- the three vehicles ----------------
// Driving numbers live here with the shapes: speeds in m/s, trunk in kg.
export const MODELS = {
  sedan: {
    name: 'Sedan', L: 4.82, W: 1.8, wheelbase: 2.75, wheelR: 0.32, wheelX: 0.775, height: 1.4,
    seats: [[0.37, 0.46, -0.06], [-0.37, 0.46, -0.06], [0.37, 0.48, -0.98], [-0.37, 0.48, -0.98]],
    maxSpeed: 31, accel: 6.8, brake: 11, grip: 1.0, offroad: 0.55, trunk: 45, fuelUse: 1 / 3400, health: 100, mass: 1.0,
  },
  wagon: {
    name: 'Station wagon', L: 5.12, W: 1.86, wheelbase: 2.95, wheelR: 0.33, wheelX: 0.8, height: 1.44,
    seats: [[0.38, 0.47, 0.0], [-0.38, 0.47, 0.0], [0.38, 0.49, -1.0], [-0.38, 0.49, -1.0]],
    maxSpeed: 28, accel: 6.2, brake: 10.5, grip: 0.95, offroad: 0.62, trunk: 75, fuelUse: 1 / 3000, health: 115, mass: 1.15,
  },
  pickup: {
    name: 'Pickup', L: 5.33, W: 1.96, wheelbase: 3.25, wheelR: 0.39, wheelX: 0.83, height: 1.76,
    seats: [[0.4, 0.72, -0.14], [-0.4, 0.72, -0.14]],
    maxSpeed: 27, accel: 6.0, brake: 10, grip: 0.92, offroad: 0.85, trunk: 110, fuelUse: 1 / 2600, health: 150, mass: 1.35,
  },
};

function buildSedan() {
  const M = MODELS.sedan, P = new Parts(), hw = M.W / 2, ax = [-M.wheelbase / 2, M.wheelbase / 2], R = M.wheelR, aR = 0.39;
  const zf = 2.31, zr = -2.51, belt = 0.875;
  P.paint(extrudeX([...sill(zr + 0.1, zf - 0.1, 0.24, ax, aR, R),
    [zf - 0.03, 0.33], [zf + 0.02, 0.45], [zf + 0.03, 0.6], [zf - 0.01, 0.72], [zf - 0.12, 0.765], [zf - 0.5, 0.8], [1.4, 0.83], [0.95, 0.865],
    [0.4, 0.875], [-0.6, 0.89], [-1.3, 0.905], [-1.52, 0.915], [-2.1, 0.935], [zr + 0.13, 0.93], [zr + 0.03, 0.9], [zr - 0.01, 0.76], [zr, 0.46], [zr + 0.06, 0.34]], M.W, 0.05));
  wells(P, ax, aR, R, M.W - 0.1);
  // greenhouse
  const half = hw - 0.075;
  greenhouse(P, {
    half, belt,
    ws: [[0.95, 0.85], [0.2, 1.335]], roof: [[0.07, 1.375], [-0.2, 1.392], [-0.6, 1.392], [-0.8, 1.38]], rear: [[-0.93, 1.345], [-1.52, 0.905]],
    posts: [{ z: -0.25, w: 0.1, lean: 0.03, top: 1.38 }],
    rearPillar: [[-0.74, 1.39], [-0.93, 1.35], [-1.53, 0.9], [-1.26, 0.86], [-0.84, 1.33]],
    windows: [
      [[0.93, belt - 0.02], [0.23, 1.33], [-0.25, 1.37], [-0.25, belt - 0.02]],
      [[-0.25, belt - 0.02], [-0.25, 1.37], [-0.83, 1.36], [-1.29, belt - 0.02]],
    ],
  });
  cabin(P, { belt, floor: 0.33, half, ws: [[0.95, 0.85], [0.2, 1.335]], front: 0.95, rear: -1.5, seat: '#5a4636', top: [[0.97, 0.864], [0.4, 0.875], [-0.6, 0.89], [-1.3, 0.905], [-1.54, 0.916]],
    rows: [{ z: 0.0, bench: false, heads: true }, { z: -0.92, bench: true, heads: false }] });
  // nose: rectangular lamps, a chrome-rimmed grille, amber corners
  for (const s of [1, -1]) {
    P.block(0.36, 0.13, 0.05, 0.02, s * 0.6, 0.645, zf + 0.02, 'head');
    P.block(0.39, 0.16, 0.04, 0.02, s * 0.6, 0.645, zf + 0.005, 'chrome');
    P.block(0.1, 0.13, 0.12, 0.02, s * (hw - 0.06), 0.645, zf - 0.03, 'amber');
    // wide tail lamps with a reverse lamp inboard
    P.block(0.5, 0.15, 0.05, 0.02, s * 0.56, 0.78, zr - 0.005, 'tail');
    P.block(0.1, 0.15, 0.052, 0.02, s * 0.25, 0.78, zr - 0.006, 'head', '#d8d6d0');
  }
  P.block(0.66, 0.15, 0.05, 0.02, 0, 0.645, zf + 0.022, 'grille');
  P.block(0.7, 0.19, 0.04, 0.02, 0, 0.645, zf + 0.008, 'chrome');
  for (let k = -2; k <= 2; k++) P.box(0.012, 0.13, 0.02, k * 0.12, 0.645, zf + 0.05, 'chrome');
  // soft bumpers with a chrome strip
  P.block(M.W - 0.04, 0.17, 0.19, 0.06, 0, 0.41, zf + 0.05, 'rubber', '#262626');
  P.block(M.W - 0.06, 0.03, 0.02, 0.01, 0, 0.44, zf + 0.145, 'chrome');
  P.block(M.W - 0.04, 0.17, 0.19, 0.06, 0, 0.43, zr - 0.05, 'rubber', '#262626');
  P.block(M.W - 0.06, 0.03, 0.02, 0.01, 0, 0.46, zr - 0.145, 'chrome');
  plate(P, zf + 0.142, 0.39, 1); plate(P, zr - 0.012, 0.6, -1);
  // sides: door gaps, handles, a rubber rub strip, mirrors, a fuel door
  seam(P, 0.955, 0.33, belt - 0.01, hw); seam(P, -0.25, 0.31, belt, hw); seam(P, -0.98, 0.36, 0.895, hw);
  handle(P, -0.08, 0.79, hw); handle(P, -0.84, 0.8, hw);
  strip(P, -0.96, 0.95, 0.56, hw); strip(P, 1.8, zf - 0.14, 0.56, hw); strip(P, zr + 0.14, -1.8, 0.56, hw);
  mirrors(P, 0.82, 0.97, hw);
  fuelDoor(P, -1.95, 0.74, hw);
  // hood and trunk shut lines
  P.box(M.W - 0.2, 0.004, 0.01, 0, 0.865, 0.94, 'rubber', '#0c0c0c');
  P.box(M.W - 0.24, 0.004, 0.01, 0, 0.918, -1.57, 'rubber', '#0c0c0c');
  P.box(1.22, 0.01, M.L - 0.7, 0, 0.235, 0, 'under');
  return P.build();
}

function buildWagon() {
  const M = MODELS.wagon, P = new Parts(), hw = M.W / 2, ax = [-M.wheelbase / 2, M.wheelbase / 2], R = M.wheelR, aR = 0.4;
  const zf = 2.42, zr = -2.7, belt = 0.9;
  P.paint(extrudeX([...sill(zr + 0.09, zf - 0.1, 0.24, ax, aR, R),
    [zf - 0.03, 0.33], [zf + 0.02, 0.46], [zf + 0.03, 0.63], [zf - 0.01, 0.74], [zf - 0.14, 0.78], [zf - 0.55, 0.81], [1.45, 0.85], [1.0, 0.885],
    [0, 0.9], [-1.5, 0.915], [zr + 0.12, 0.93], [zr + 0.02, 0.905], [zr - 0.01, 0.62], [zr, 0.43], [zr + 0.06, 0.33]], M.W, 0.05));
  wells(P, ax, aR, R, M.W - 0.1);
  const half = hw - 0.07;
  greenhouse(P, {
    half, belt,
    ws: [[1.0, 0.875], [0.28, 1.365]], roof: [[0.15, 1.405], [-0.4, 1.425], [-1.6, 1.425], [-2.4, 1.415]], rear: [[-2.58, 1.385], [-2.66, 0.92]],
    posts: [{ z: -0.24, w: 0.1, lean: 0.02, top: 1.42 }, { z: -1.32, w: 0.11, lean: -0.02, top: 1.42 }],
    rearPillar: [[-2.38, 1.425], [-2.58, 1.39], [-2.665, 0.92], [-2.44, 0.89]],
    windows: [
      [[0.98, belt - 0.02], [0.31, 1.36], [-0.24, 1.4], [-0.24, belt - 0.02]],
      [[-0.24, belt - 0.02], [-0.24, 1.4], [-1.32, 1.4], [-1.32, belt - 0.01]],
      [[-1.32, belt - 0.01], [-1.32, 1.4], [-2.44, 1.4], [-2.44, belt]],
    ],
  });
  cabin(P, { belt, floor: 0.34, half, ws: [[1.0, 0.875], [0.28, 1.365]], front: 1.0, rear: -2.6, seat: '#6b5a44', top: [[1.02, 0.884], [0, 0.9], [-1.5, 0.915], [-2.62, 0.929]],
    rows: [{ z: 0.06, bench: true, heads: true }, { z: -0.95, bench: true, heads: false }] });
  // woodgrain flanks framed in cream trim, broken by the rear wheel arch
  const az = ax[0], wz0 = 1.02, wz1 = zr + 0.16, yt = 0.84, yb = 0.46;
  const bottom = [];
  for (let k = 0; k <= 16; k++) {
    const a = Math.PI * 0.12 + (k / 16) * Math.PI * 0.76;
    const y = R + Math.sin(a) * (aR + 0.05);
    if (y > yb) bottom.push([az + Math.cos(a) * (aR + 0.05), y]);
  }
  const panel = [[wz0, yt], [wz1, yt], [wz1, yb], ...bottom.reverse(), [wz0, yb]];
  for (const s of [1, -1]) P.sidePoly(panel, s * (hw + 0.002), s, 'wood');
  strip(P, wz1, wz0, yt + 0.012, hw, 'trim', 0.03);
  strip(P, wz1, az - aR - 0.08, yb - 0.012, hw, 'trim', 0.026);
  strip(P, az + aR + 0.08, wz0, yb - 0.012, hw, 'trim', 0.026);
  for (const s of [1, -1]) P.block(0.02, 0.38, 0.03, 0.01, s * (hw + 0.006), (yt + yb) / 2, wz0, 'trim');
  // roof rack
  for (const s of [1, -1]) P.block(0.035, 0.035, 2.5, 0.015, s * (half - 0.14), 1.46, -1.0, 'chrome');
  for (const z of [0.2, -2.2]) { P.box(M.W - 0.42, 0.025, 0.04, 0, 1.47, z, 'chrome'); for (const s of [1, -1]) P.box(0.05, 0.05, 0.08, s * (half - 0.14), 1.44, z, 'rubber'); }
  // twin square lamps each side, a wide chrome grille, wraparound tails
  for (const s of [1, -1]) {
    for (const lx of [0.5, 0.71]) P.block(0.17, 0.15, 0.05, 0.02, s * lx, 0.66, zf + 0.02, 'head');
    P.block(0.42, 0.19, 0.04, 0.02, s * 0.605, 0.66, zf + 0.005, 'chrome');
    P.block(0.08, 0.1, 0.16, 0.02, s * (hw - 0.05), 0.66, zf - 0.06, 'amber');
    P.block(0.2, 0.3, 0.05, 0.02, s * (hw - 0.12), 0.75, zr - 0.005, 'tail');
    P.block(0.04, 0.3, 0.18, 0.02, s * (hw - 0.012), 0.75, zr + 0.07, 'tail');
  }
  P.block(0.56, 0.17, 0.05, 0.02, 0, 0.66, zf + 0.022, 'grille');
  for (let k = 0; k < 4; k++) P.box(0.56, 0.012, 0.02, 0, 0.6 + k * 0.04, zf + 0.05, 'chrome');
  P.box(0.012, 0.17, 0.022, 0, 0.66, zf + 0.052, 'chrome');
  // chrome bumpers with rubber guards
  P.block(M.W + 0.02, 0.15, 0.17, 0.05, 0, 0.42, zf + 0.06, 'chrome');
  P.block(M.W + 0.02, 0.15, 0.17, 0.05, 0, 0.44, zr - 0.06, 'chrome');
  for (const s of [1, -1]) { P.block(0.08, 0.13, 0.06, 0.02, s * 0.45, 0.42, zf + 0.15, 'rubber'); P.block(0.08, 0.13, 0.06, 0.02, s * 0.45, 0.44, zr - 0.15, 'rubber'); }
  plate(P, zf + 0.147, 0.42, 1); plate(P, zr - 0.012, 0.6, -1);
  // tailgate: shut lines, a chrome handle
  P.box(1.5, 0.006, 0.006, 0, 0.47, zr - 0.006, 'rubber', '#0c0c0c');
  P.block(0.36, 0.04, 0.03, 0.012, 0, 0.82, zr - 0.012, 'chrome');
  seam(P, 1.0, 0.34, belt - 0.01, hw); seam(P, -0.24, 0.31, belt, hw); seam(P, -1.3, 0.72, belt + 0.01, hw);
  handle(P, -0.06, 0.8, hw); handle(P, -1.12, 0.81, hw);
  mirrors(P, 0.86, 0.99, hw);
  fuelDoor(P, -2.2, 0.7, hw + 0.003);
  P.box(M.W - 0.2, 0.004, 0.01, 0, 0.884, 0.99, 'rubber', '#0c0c0c');
  P.box(1.28, 0.01, M.L - 0.7, 0, 0.235, 0, 'under');
  return P.build();
}

function buildPickup() {
  const M = MODELS.pickup, P = new Parts(), hw = M.W / 2, ax = [-M.wheelbase / 2, M.wheelbase / 2], R = M.wheelR, aR = 0.47;
  const zf = 2.45, zr = -2.86, cb = -0.6, belt = 1.21;
  // front end and cab, up to the beltline
  P.paint(extrudeX([...sill(cb, zf - 0.08, 0.41, [ax[1]], aR, R),
    [zf - 0.04, 0.5], [zf + 0.02, 0.6], [zf + 0.03, 1.0], [zf - 0.03, 1.1], [zf - 0.15, 1.135], [zf - 0.6, 1.155], [1.2, 1.175], [0.88, 1.2],
    [0, belt], [cb, belt + 0.01], [cb, 0.41]], M.W, 0.06));
  wells(P, [ax[1]], aR, R, M.W - 0.1);
  // the bed: two side panels around the rear wheels, a front wall, floor, tailgate
  const bz0 = zr, bz1 = cb - 0.07, inner = hw - 0.1;
  for (const s of [1, -1]) {
    P.paint(extrudeX([...sill(bz0 + 0.04, bz1, 0.5, [ax[0]], aR, R), [bz1, belt], [bz0 + 0.02, belt], [bz0, belt - 0.05], [bz0, 0.55]], 0.1, 0.03, s * (hw - 0.05)));
    // bed-rail caps
    P.block(0.12, 0.025, bz1 - bz0 - 0.04, 0.01, s * (hw - 0.055), belt + 0.012, (bz0 + bz1) / 2, 'rubber', '#202020');
    // inner wheel-well humps
    P.block(0.25, 0.3, 1.04, 0.12, s * (inner - 0.125), 0.76, ax[0], 'rubber', '#262626');
  }
  wells(P, [ax[0]], aR, R, M.W - 0.1);
  P.box(inner * 2, 0.04, bz1 - bz0 - 0.1, 0, 0.76, (bz0 + bz1) / 2, 'rubber', '#2a2a2a');
  for (let k = -3; k <= 3; k++) P.box(0.03, 0.012, bz1 - bz0 - 0.16, k * 0.24, 0.785, (bz0 + bz1) / 2, 'rubber', '#333333');
  P.box(inner * 2, belt - 0.78, 0.06, 0, (belt + 0.78) / 2, bz1 - 0.03, 'paint');
  P.box(inner * 2, belt - 0.6, 0.06, 0, (belt + 0.6) / 2, bz0 + 0.035, 'paint');
  P.block(0.3, 0.05, 0.03, 0.015, 0, belt - 0.1, bz0 - 0.002, 'chrome');
  P.box(inner * 2 - 0.1, 0.012, 0.012, 0, belt - 0.2, bz0 - 0.001, 'rubber', '#0c0c0c');
  P.box(1.3, 0.3, bz1 - bz0 - 0.2, 0, 0.6, (bz0 + bz1) / 2, 'under');
  // cab greenhouse; the back wall is a frame round the rear window
  const half = hw - 0.06;
  greenhouse(P, {
    half, belt, roofT: 0.08,
    ws: [[0.88, 1.19], [0.36, 1.69]], roof: [[0.25, 1.735], [-0.1, 1.75], [-0.45, 1.748]], rear: [[cb + 0.02, 1.735], [cb, belt]],
    rearGlass: false,
    rearPillar: [[-0.4, 1.75], [cb + 0.02, 1.74], [cb, belt - 0.02], [-0.42, belt - 0.02]],
    windows: [[[0.86, belt - 0.02], [0.38, 1.685], [-0.42, 1.735], [-0.42, belt - 0.02]]],
  });
  const wz = cb + 0.03;
  for (const s of [1, -1]) P.box(half - 0.56, 1.74 - belt, 0.06, s * (0.56 + (half - 0.56) / 2), (1.74 + belt) / 2, wz, 'paint');
  P.box(1.12, 0.1, 0.06, 0, 1.69, wz, 'paint');
  P.box(1.12, 0.1, 0.06, 0, belt + 0.05, wz, 'paint');
  P.glassPlane(1.12, 0.42, 0, (1.64 + belt + 0.1) / 2, wz, Math.PI);
  cabin(P, { belt, floor: 0.62, half, ws: [[0.88, 1.19], [0.36, 1.69]], front: 0.88, rear: cb + 0.06, seat: '#4f4a44', top: [[0.9, 1.2], [0, 1.21], [cb + 0.01, 1.22]],
    rows: [{ z: -0.12, bench: true, heads: false }] });
  // amber cab lights on the roof's leading edge
  for (const x of [-0.25, 0, 0.25]) P.block(0.09, 0.03, 0.05, 0.012, x, 1.755, 0.2, 'amber');
  // a big chrome grille between square lamps
  P.block(1.38, 0.42, 0.05, 0.03, 0, 0.84, zf + 0.02, 'chrome');
  P.block(0.84, 0.32, 0.05, 0.02, 0, 0.84, zf + 0.035, 'grille');
  for (let k = 0; k < 3; k++) P.box(0.84, 0.03, 0.025, 0, 0.74 + k * 0.1, zf + 0.06, 'chrome');
  for (const k of [-1, 0, 1]) P.box(0.025, 0.32, 0.025, k * 0.28, 0.84, zf + 0.062, 'chrome');
  for (const s of [1, -1]) {
    P.block(0.2, 0.2, 0.05, 0.03, s * 0.56, 0.87, zf + 0.04, 'head');
    P.block(0.2, 0.08, 0.05, 0.02, s * 0.56, 0.7, zf + 0.04, 'amber');
    P.block(0.09, 0.32, 0.05, 0.02, s * (hw - 0.05), 0.96, zr - 0.005, 'tail');
    P.block(0.05, 0.1, 0.1, 0.02, s * (hw - 0.02), 0.95, zf - 0.12, 'amber');
  }
  // chrome bumpers, the rear one a step
  P.block(M.W + 0.04, 0.22, 0.2, 0.05, 0, 0.55, zf + 0.08, 'chrome');
  P.block(M.W, 0.18, 0.24, 0.04, 0, 0.56, zr - 0.08, 'chrome');
  P.box(0.5, 0.012, 0.16, 0, 0.652, zr - 0.08, 'rubber', '#222222');
  plate(P, zf + 0.183, 0.54, 1); plate(P, zr - 0.205, 0.56, -1);
  seam(P, 0.87, 0.48, belt - 0.01, hw); seam(P, -0.42, 0.48, belt, hw);
  handle(P, -0.3, 1.1, hw);
  strip(P, 1.85, zf - 0.2, 0.83, hw, 'chrome', 0.02); strip(P, cb + 0.02, 1.1, 0.83, hw, 'chrome', 0.02); strip(P, ax[0] + aR + 0.05, bz1 - 0.02, 0.83, hw, 'chrome', 0.02); strip(P, bz0 + 0.06, ax[0] - aR - 0.05, 0.83, hw, 'chrome', 0.02);
  mirrors(P, 0.78, 1.32, hw, true);
  P.disc(0.075, 0.01, -(hw + 0.002), 1.0, -1.15, 'paint');
  P.box(M.W - 0.2, 0.004, 0.01, 0, 1.2, 0.89, 'rubber', '#0c0c0c');
  P.box(1.3, 0.12, zf - cb, 0, 0.42, (zf + cb) / 2, 'under');
  return P.build();
}

// a wheel of radius 1 (scaled per car): tyre, recessed rim, hub and lugs; axle along x
function buildWheel() {
  const P = new Parts(), w = 0.62;
  const prof = [new THREE.Vector2(0.66, -w / 2 + 0.03), new THREE.Vector2(0.78, -w / 2)];
  for (let k = 0; k <= 6; k++) { const a = -Math.PI / 2 + (k / 6) * Math.PI; prof.push(new THREE.Vector2(0.88 + Math.cos(a) * 0.12, Math.sin(a) * (w / 2 - 0.02))); }
  prof.push(new THREE.Vector2(0.78, w / 2), new THREE.Vector2(0.66, w / 2 - 0.03));
  const tire = new THREE.LatheGeometry(prof, 20);
  tire.rotateZ(Math.PI / 2);
  P.add(tire, 'tire');
  // rim: a dished disc with a raised lip
  const rimP = [new THREE.Vector2(0.0, -w / 2 + 0.12), new THREE.Vector2(0.5, -w / 2 + 0.12), new THREE.Vector2(0.62, -w / 2 + 0.05), new THREE.Vector2(0.67, -w / 2 + 0.03),
    new THREE.Vector2(0.67, w / 2 - 0.03), new THREE.Vector2(0.62, w / 2 - 0.05), new THREE.Vector2(0.5, w / 2 - 0.12), new THREE.Vector2(0.0, w / 2 - 0.12)];
  const rim = new THREE.LatheGeometry(rimP.reverse(), 20);
  rim.rotateZ(Math.PI / 2);
  P.add(rim, 'rim');
  for (const s of [1, -1]) {
    const hub = new THREE.CylinderGeometry(0.2, 0.25, 0.08, 16); hub.rotateZ(Math.PI / 2); hub.translate(s * (w / 2 - 0.09), 0, 0);
    P.add(hub, 'chrome');
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const lug = new THREE.CylinderGeometry(0.035, 0.035, 0.06, 6); lug.rotateZ(Math.PI / 2); lug.translate(s * (w / 2 - 0.1), Math.cos(a) * 0.32, Math.sin(a) * 0.32);
      P.add(lug, 'chrome');
    }
  }
  return P.build().opaque;
}

let built = null;
export function vehicleGeometry() {
  if (built) return built;
  built = { pickup: buildPickup(), sedan: buildSedan(), wagon: buildWagon(), wheel: buildWheel() };
  return built;
}
