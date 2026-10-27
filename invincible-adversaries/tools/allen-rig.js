// Allen the Alien: Sketchfab's "Allen the Alien - Invincible" (patmateee, CC BY 4.0) is a 1.4M-triangle
// static sculpt in a hands-on-hips pose, with a full nude body under separate clothing shells and no
// skeleton. This turns it into a game model: every triangle that no camera can see is dropped, each
// material is decimated, and the result is rigged with a hand-placed skeleton (refined against the
// mesh) and automatic skin weights. Used by convert-models.html.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_simplifier.module.js';
import { MeshBVH } from 'https://cdn.jsdelivr.net/npm/three-mesh-bvh@0.7.8/build/index.module.js';

// source material -> our part name, its colour, and the triangle budget it is decimated to
const PARTS = {
  'Material': { name: 'Skin', tris: 15000 },
  'Material.001': { name: 'Suit', tris: 15000 },
  'Material.002': { name: 'Shirt', tris: 14000 },
  'Material.004': { name: 'Eye', tris: 700 },
  'Material.003': { name: 'Pupil', tris: 160 },
  'Material.005': { name: 'Trim', tris: 1600 },
  'Material.006': { name: 'Belt', tris: 1400 },
  'Material.007': { name: 'Metal', tris: 1800 },
  'Material.008': { name: 'Pouch', tris: 360 },
};

// Joint guesses in model units (facing +z, character's left = +x), read off orthographic views;
// refine() pulls each onto the centre of the limb around it.
const GUESS = {
  pelvis: [0, 0.12, -0.08], spine1: [0, 0.48, -0.12], spine2: [0, 0.82, -0.15], spine3: [0, 1.12, -0.16],
  neck: [0, 1.42, -0.12], head: [0, 1.6, -0.06], headEnd: [0, 2.09, 0],
  clav: [0.12, 1.36, -0.12], shoulder: [0.66, 1.18, -0.16], elbow: [0.9, 0.62, -0.18], wrist: [0.61, 0.31, 0.06], handEnd: [0.33, 0.22, 0.22],
  hip: [0.22, 0.04, -0.06], knee: [0.2, -0.86, -0.04], ankle: [0.27, -1.62, -0.13], ball: [0.3, -1.86, 0.12], toeEnd: [0.34, -1.9, 0.4],
};

const V = (a) => new THREE.Vector3(...a);
const mirror = (a) => [-a[0], a[1], a[2]];

export async function buildAllen(scene, { say, renderer }) {
  await MeshoptSimplifier.ready;
  scene.updateMatrixWorld(true);
  // ---- facing: from the head's centre to the eye, turned to +z
  const sample = (o, step = 5) => { const a = o.geometry.attributes.position, v = new THREE.Vector3(), out = []; for (let i = 0; i < a.count; i += step) out.push(v.fromBufferAttribute(a, i).applyMatrix4(o.matrixWorld).clone()); return out; };
  const meshes = []; scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const eyeMesh = meshes.find((o) => o.material.name === 'Material.004');
  const eye = centroid(sample(eyeMesh, 1));
  const head = centroid(meshes.filter((o) => o.material.name === 'Material').flatMap((o) => sample(o)).filter((p) => p.y > eye.y - 0.25));
  const yaw = Math.atan2(eye.x - head.x, eye.z - head.z);
  const turn = new THREE.Matrix4().makeRotationY(-yaw);
  say(`allen: facing ${(yaw * 57.3).toFixed(1)}° in the source, turned to +z`);

  // ---- bake and weld each material into one indexed, position-only geometry
  const groups = {};
  for (const o of meshes) {
    const part = PARTS[o.material.name];
    if (!part) { say(`allen: skipping ${o.name} (${o.material.name})`); continue; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', o.geometry.attributes.position.clone());
    if (o.geometry.index) g.setIndex(o.geometry.index.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(turn, o.matrixWorld));
    (groups[part.name] ||= { part, src: o.material, list: [] }).list.push(g);
  }
  for (const k in groups) {
    const gr = groups[k];
    gr.geo = mergeVertices(mergeGeometries(gr.list, false), 1e-5);
    gr.list = null;
  }
  const triCount = (g) => g.index.count / 3;
  say('allen: source ' + Object.entries(groups).map(([k, g]) => `${k} ${triCount(g.geo)}`).join(', '));

  // ---- visibility: render every triangle's id from 72 directions; keep what any view sees
  await cullHidden(groups, renderer, say);

  // ---- decimate each part to its budget, then recompute smooth normals
  for (const k in groups) {
    const gr = groups[k], g = gr.geo;
    const before = triCount(g);
    const target = Math.min(before, gr.part.tris) * 3;
    const pos = g.attributes.position.array;
    const [idx] = MeshoptSimplifier.simplify(new Uint32Array(g.index.array), pos, 3, target, 0.05, ['LockBorder']);
    gr.geo = compact(pos, idx);
    gr.geo.computeVertexNormals();
    say(`allen: ${k} ${before} -> ${triCount(gr.geo)} triangles`);
  }

  // ---- components (connected pieces) and what each one is: the skin splits into head, hands and
  // feet once the hidden body is gone; the suit into two sleeves and the trousers
  for (const k in groups) groups[k].comps = components(groups[k].geo);
  const label = (k, c) => {
    const { center: m, size } = c;
    if (k === 'Eye' || k === 'Pupil') return 'head';
    if (k === 'Belt' || k === 'Metal' || k === 'Pouch') return 'waist';
    if (k === 'Shirt' || k === 'Trim') return 'torso';
    if (k === 'Suit') return m.y > 0.3 && Math.abs(m.x) > 0.35 ? (m.x > 0 ? 'sleeveL' : 'sleeveR') : 'legs';
    // skin
    if (m.y > 1.2) return 'head';
    if (m.y < -1.3) return m.x > 0 ? 'footL' : 'footR';
    if (Math.abs(m.x) > 0.15 && m.y > -0.3 && m.y < 0.8 && size < 0.9) return m.x > 0 ? 'handL' : 'handR';
    return 'any';
  };
  for (const k in groups) for (const c of groups[k].comps.list) c.label = label(k, c);
  say('allen: pieces ' + Object.entries(groups).map(([k, g]) => `${k}[${g.comps.list.map((c) => c.label).join(' ')}]`).join(', '));

  // ---- skeleton, refined against the shells around each joint
  const pointsOf = (k, lab) => { const gr = groups[k], out = []; const p = gr.geo.attributes.position; for (let i = 0; i < p.count; i++) if (!lab || lab.includes(gr.comps.list[gr.comps.of[i]].label)) out.push(new THREE.Vector3().fromBufferAttribute(p, i)); return out; };
  const J = refine(GUESS, { legs: pointsOf('Suit', ['legs']), sleeveL: pointsOf('Suit', ['sleeveL']), sleeveR: pointsOf('Suit', ['sleeveR']), shirt: pointsOf('Shirt'), skin: pointsOf('Skin', ['head', 'footL', 'footR']), say });
  const { bones, byName, segs } = skeleton(J);

  // ---- skin weights
  const allGeo = mergeGeometries(Object.values(groups).map((g) => g.geo), false);
  const bvh = new MeshBVH(allGeo);
  const ALLOW = {
    head: ['head', 'neck', 'spine_03'],
    handL: ['hand_l', 'lowerarm_l'], handR: ['hand_r', 'lowerarm_r'],
    footL: ['foot_l', 'toe_l', 'calf_l'], footR: ['foot_r', 'toe_r', 'calf_r'],
    sleeveL: ['clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l'], sleeveR: ['clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r'],
    legs: ['pelvis', 'spine_01', 'thigh_l', 'calf_l', 'foot_l', 'thigh_r', 'calf_r', 'foot_r'],
    torso: ['spine_01', 'spine_02', 'spine_03', 'neck', 'clavicle_l', 'upperarm_l', 'clavicle_r', 'upperarm_r'],
    waist: ['pelvis', 'spine_01'],
    any: Object.keys(segs),
  };
  const out = new THREE.Group();
  out.add(bones[0]);
  out.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  for (const k in groups) {
    const gr = groups[k], g = gr.geo;
    const { index, weight } = skinWeights(g, gr.comps, ALLOW, segs, byName, bvh);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
    const c = gr.src.color, m = new THREE.MeshStandardMaterial({ name: 'Allen_' + k, color: c.clone(), roughness: Math.max(0.35, gr.src.roughness), metalness: Math.min(0.3, gr.src.metalness) });
    const sm = new THREE.SkinnedMesh(g, m);
    sm.name = 'Allen_' + k;
    out.add(sm);
    sm.bind(skel, new THREE.Matrix4());
  }
  say(`allen: ${bones.length} bones, ${Object.values(groups).reduce((s, g) => s + triCount(g.geo), 0)} triangles`);
  return out;
}

function centroid(pts) { const c = new THREE.Vector3(); for (const p of pts) c.add(p); return c.multiplyScalar(1 / Math.max(1, pts.length)); }

/** an indexed geometry holding only the vertices that idx uses */
function compact(pos, idx) {
  const remap = new Int32Array(pos.length / 3).fill(-1);
  let n = 0;
  for (let i = 0; i < idx.length; i++) if (remap[idx[i]] < 0) remap[idx[i]] = n++;
  const p = new Float32Array(n * 3), ix = new Uint32Array(idx.length);
  for (let v = 0; v < remap.length; v++) if (remap[v] >= 0) { const o = remap[v] * 3; p[o] = pos[v * 3]; p[o + 1] = pos[v * 3 + 1]; p[o + 2] = pos[v * 3 + 2]; }
  for (let i = 0; i < idx.length; i++) ix[i] = remap[idx[i]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setIndex(new THREE.BufferAttribute(ix, 1));
  return g;
}

/**
 * Drops triangles no outside camera can see (the body under the clothes, the tops of the sleeves
 * under the shirt...): each triangle is drawn in its own id colour from 72 directions around the
 * model, and kept (with two rings of neighbours, so seams can't open) if any view shows it.
 */
async function cullHidden(groups, renderer, say) {
  const keys = Object.keys(groups);
  let total = 0; const base = {};
  for (const k of keys) { base[k] = total; total += groups[k].geo.index.count / 3; }
  const pos = new Float32Array(total * 9), col = new Uint8Array(total * 9);
  for (const k of keys) {
    const g = groups[k].geo, p = g.attributes.position.array, ix = g.index.array;
    for (let t = 0; t < ix.length / 3; t++) {
      const id = base[k] + t, o = id * 9, c = id + 1;
      for (let j = 0; j < 3; j++) {
        const v = ix[t * 3 + j] * 3;
        pos[o + j * 3] = p[v]; pos[o + j * 3 + 1] = p[v + 1]; pos[o + j * 3 + 2] = p[v + 2];
        col[o + j * 3] = c & 255; col[o + j * 3 + 1] = (c >> 8) & 255; col[o + j * 3 + 2] = (c >> 16) & 255;
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('idc', new THREE.BufferAttribute(col, 3, true));
  const mat = new THREE.ShaderMaterial({
    vertexShader: 'attribute vec3 idc; varying vec3 vId; void main() { vId = idc; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vId; void main() { gl_FragColor = vec4(vId, 1.0); }',
    side: THREE.DoubleSide,
  });
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0, 0, 0);
  scene.add(new THREE.Mesh(geo, mat));
  geo.computeBoundingSphere();
  const { center, radius } = geo.boundingSphere;
  const S = 2048;
  const rt = new THREE.WebGLRenderTarget(S, S, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
  const cam = new THREE.OrthographicCamera(-radius, radius, radius, -radius, 0.01, radius * 4);
  const buf = new Uint8Array(S * S * 4), seen = new Uint8Array(total);
  const N = 72;
  for (let i = 0; i < N; i++) {
    // Fibonacci sphere, a little denser below the horizon for the soles and under the arms
    const y = 1 - (i + 0.5) / N * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996;
    cam.position.set(center.x + Math.cos(a) * r * radius * 2, center.y + y * radius * 2, center.z + Math.sin(a) * r * radius * 2);
    cam.lookAt(center); cam.updateMatrixWorld();
    renderer.setRenderTarget(rt); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, S, S, buf);
    for (let p = 0; p < buf.length; p += 4) { const id = buf[p] | (buf[p + 1] << 8) | (buf[p + 2] << 16); if (id) seen[id - 1] = 1; }
    if (i % 12 === 11) await new Promise((r) => setTimeout(r, 0));
  }
  renderer.setRenderTarget(null);
  rt.dispose(); geo.dispose(); mat.dispose();
  // two rings of neighbours of everything seen, then rebuild each part
  for (const k of keys) {
    const g = groups[k].geo, ix = g.index.array, nt = ix.length / 3;
    let keep = new Uint8Array(nt);
    for (let t = 0; t < nt; t++) keep[t] = seen[base[k] + t];
    for (let ring = 0; ring < 2; ring++) {
      const vmark = new Uint8Array(g.attributes.position.count);
      for (let t = 0; t < nt; t++) if (keep[t]) { vmark[ix[t * 3]] = vmark[ix[t * 3 + 1]] = vmark[ix[t * 3 + 2]] = 1; }
      const next = new Uint8Array(nt);
      for (let t = 0; t < nt; t++) next[t] = keep[t] || vmark[ix[t * 3]] || vmark[ix[t * 3 + 1]] || vmark[ix[t * 3 + 2]] ? 1 : 0;
      keep = next;
    }
    const kept = []; for (let t = 0; t < nt; t++) if (keep[t]) kept.push(ix[t * 3], ix[t * 3 + 1], ix[t * 3 + 2]);
    groups[k].geo = compact(g.attributes.position.array, new Uint32Array(kept));
    say(`allen: ${k} keeps ${kept.length / 3} of ${nt} triangles (the rest is never seen)`);
  }
}

/** connected pieces of an indexed geometry: { of: vertex -> piece, list: [{ center, size, count }] } */
function components(g) {
  const n = g.attributes.position.count, ix = g.index.array;
  const parent = new Int32Array(n); for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  for (let t = 0; t < ix.length; t += 3) { const a = find(ix[t]), b = find(ix[t + 1]), c = find(ix[t + 2]); parent[b] = a; parent[c] = a; }
  const of = new Int32Array(n), idOf = new Map(), list = [];
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let id = idOf.get(r);
    if (id === undefined) { id = list.length; idOf.set(r, id); list.push({ box: new THREE.Box3(), count: 0 }); }
    of[i] = id; list[id].count++; list[id].box.expandByPoint(v.fromBufferAttribute(p, i));
  }
  for (const c of list) { c.center = c.box.getCenter(new THREE.Vector3()); c.size = c.box.getSize(new THREE.Vector3()).length(); }
  return { of, list };
}

/** centre of the points within `half` of the plane through c (normal n) and within `radius` of c */
function slab(points, c, n, half, radius) {
  const s = new THREE.Vector3(), d = new THREE.Vector3(); let k = 0;
  for (const p of points) { d.subVectors(p, c); if (Math.abs(d.dot(n)) < half && d.length() < radius) { s.add(p); k++; } }
  return k > 12 ? s.multiplyScalar(1 / k) : null;
}

/** joints for both sides, each moved onto the middle of the limb or torso around its guess */
function refine(G, { legs, sleeveL, sleeveR, shirt, skin, say }) {
  const J = {};
  for (const k of ['pelvis', 'spine1', 'spine2', 'spine3', 'neck', 'head', 'headEnd']) J[k] = V(G[k]);
  const UPV = new THREE.Vector3(0, 1, 0);
  // torso: depth from the shirt's cross-sections (and the trousers' at the pelvis)
  for (const [k, pts] of [['spine2', shirt], ['spine3', shirt], ['spine1', shirt], ['pelvis', legs]]) {
    const c = slab(pts, J[k], UPV, 0.03, 0.9);
    if (c) J[k].z = c.z * 0.85 + J[k].z * 0.15; // (a little behind the middle, where the spine is)
  }
  const nk = slab(skin.filter((p) => p.y > 1.2), J.neck, UPV, 0.03, 0.4); if (nk) { J.neck.x = 0; J.neck.z = nk.z; }
  for (const s of ['L', 'R']) {
    const m = s === 'L' ? (a) => a : mirror, sleeve = s === 'L' ? sleeveL : sleeveR, side = s === 'L' ? 1 : -1;
    const g = (k) => V(m(G[k]));
    const sh = g('shoulder'), el = g('elbow'), wr = g('wrist');
    // upper arm axis from two sections of the sleeve, then the shoulder on it
    const ua = new THREE.Vector3().subVectors(el, sh).normalize();
    const a1 = slab(sleeve, sh.clone().lerp(el, 0.35), ua, 0.03, 0.35), a2 = slab(sleeve, sh.clone().lerp(el, 0.7), ua, 0.03, 0.35);
    let shoulder = sh, elbow = el;
    if (a1 && a2) {
      const axis = new THREE.Vector3().subVectors(a2, a1).normalize();
      shoulder = a1.clone().addScaledVector(axis, -a1.distanceTo(sh));
    }
    const bend = new THREE.Vector3().subVectors(wr, el).normalize().add(ua).normalize();
    const e = slab(sleeve, el, bend, 0.04, 0.35); if (e) elbow = e;
    const fa = new THREE.Vector3().subVectors(wr, elbow).normalize();
    const w = slab(sleeve, wr.clone().addScaledVector(fa, -0.08), fa, 0.03, 0.3);
    const wrist = w ? w.addScaledVector(fa, 0.08) : wr;
    J['clav' + s] = g('clav'); J['shoulder' + s] = shoulder; J['elbow' + s] = elbow; J['wrist' + s] = wrist; J['handEnd' + s] = g('handEnd');
    // legs: thigh and knee sections of the trousers
    const legPts = legs.filter((p) => p.x * side > 0.03);
    const th = slab(legPts, V(m([0.22, -0.3, -0.06])), UPV, 0.03, 0.4);
    const kn = slab(legPts, g('knee'), UPV, 0.03, 0.35);
    const an = slab(skin.filter((p) => p.x * side > 0 && p.y < -1.2), g('ankle'), UPV, 0.03, 0.3);
    J['hip' + s] = th ? new THREE.Vector3(th.x * 0.92, G.hip[1], th.z) : g('hip');
    J['knee' + s] = kn ? new THREE.Vector3(kn.x, G.knee[1], kn.z + 0.02) : g('knee');
    J['ankle' + s] = an ? new THREE.Vector3(an.x, G.ankle[1], an.z) : g('ankle');
    J['ball' + s] = g('ball'); J['toeEnd' + s] = g('toeEnd');
  }
  say('allen: joints ' + Object.entries(J).map(([k, v]) => `${k} ${v.toArray().map((x) => x.toFixed(2)).join(',')}`).join(' | '));
  return J;
}

/** bones in a hierarchy at the joints (identity rotations), and each bone's segment for weighting */
function skeleton(J) {
  const defs = [
    ['pelvis', null, 'pelvis', 'spine1'], ['spine_01', 'pelvis', 'spine1', 'spine2'], ['spine_02', 'spine_01', 'spine2', 'spine3'], ['spine_03', 'spine_02', 'spine3', 'neck'],
    ['neck', 'spine_03', 'neck', 'head'], ['head', 'neck', 'head', 'headEnd'],
  ];
  for (const [s, l] of [['L', 'l'], ['R', 'r']]) {
    defs.push(
      [`clavicle_${l}`, 'spine_03', 'clav' + s, 'shoulder' + s], [`upperarm_${l}`, `clavicle_${l}`, 'shoulder' + s, 'elbow' + s],
      [`lowerarm_${l}`, `upperarm_${l}`, 'elbow' + s, 'wrist' + s], [`hand_${l}`, `lowerarm_${l}`, 'wrist' + s, 'handEnd' + s],
      [`thigh_${l}`, 'pelvis', 'hip' + s, 'knee' + s], [`calf_${l}`, `thigh_${l}`, 'knee' + s, 'ankle' + s],
      [`foot_${l}`, `calf_${l}`, 'ankle' + s, 'ball' + s], [`toe_${l}`, `foot_${l}`, 'ball' + s, 'toeEnd' + s],
    );
  }
  const bones = [], byName = {}, segs = {};
  for (const [name, parent, a, b] of defs) {
    const bone = new THREE.Bone(); bone.name = name;
    const pa = J[a];
    if (parent) { byName[parent].add(bone); bone.position.copy(pa).sub(byName[parent].userData.at); } else bone.position.copy(pa);
    bone.userData.at = pa.clone();
    byName[name] = bone; bones.push(bone);
    // the pelvis reaches down between the hips so the seat follows it
    segs[name] = name === 'pelvis' ? [new THREE.Vector3(J.pelvis.x, J.pelvis.y - 0.1, J.pelvis.z), J.spine1.clone()] : [pa.clone(), J[b].clone()];
  }
  bones.forEach((b, i) => { b.userData.index = i; });
  return { bones, byName, segs };
}

const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _d = new THREE.Vector3(), _n = new THREE.Vector3();
const LIMB = /^(thigh|calf|foot|upperarm|lowerarm)_/;
function closestOnSeg(p, a, b, out) {
  _d.subVectors(b, a); const l2 = _d.lengthSq();
  const t = l2 > 0 ? THREE.MathUtils.clamp(_q.subVectors(p, a).dot(_d) / l2, 0, 1) : 0;
  return out.copy(a).addScaledVector(_d, t);
}

/**
 * Four bone weights per vertex: inverse distance (to the 4th power) to the segment of each bone the
 * vertex's piece may follow, counting only bones it can reach through the inside of the body (so the
 * chest never follows the upper arm across the armpit). Then smoothed over each piece's surface.
 */
function skinWeights(g, comps, ALLOW, segs, byName, bvh) {
  const n = g.attributes.position.count, pos = g.attributes.position, nor = g.attributes.normal;
  const W = new Float32Array(n * 32), I = new Int16Array(n * 32).fill(-1); // up to 32 candidates per vertex
  const ray = new THREE.Ray(), hitTarget = {};
  const best = [];
  for (let v = 0; v < n; v++) {
    _p.fromBufferAttribute(pos, v); _n.fromBufferAttribute(nor, v);
    const lab = comps.list[comps.of[v]].label;
    const pool = ALLOW[lab] || ALLOW.any;
    // a side's limbs never take vertices from the other side of the body (the inner thighs)
    let allowed = pool.filter((b) => !(b.endsWith('_l') && _p.x < -0.05) && !(b.endsWith('_r') && _p.x > 0.05));
    if (!allowed.length) allowed = pool;
    best.length = 0;
    for (const b of allowed) {
      const [a, e] = segs[b];
      // a limb bone never takes what lies past its child joint (the side toe isn't the calf's)
      if (LIMB.test(b)) {
        _d.subVectors(e, a); const len = _d.length();
        if (_q.subVectors(_p, a).dot(_d) / len > len + 0.1) continue;
      }
      const c = closestOnSeg(_p, a, e, new THREE.Vector3());
      best.push({ b, c, d: c.distanceTo(_p) });
    }
    if (!best.length) for (const b of allowed) { const c = closestOnSeg(_p, segs[b][0], segs[b][1], new THREE.Vector3()); best.push({ b, c, d: c.distanceTo(_p) }); }
    // only bones about as near as the nearest one (an ankle never follows the spine)
    const dmin = Math.min(...best.map((x) => x.d));
    const near = best.filter((x) => x.d < Math.max(dmin * 2.2, dmin + 0.15));
    for (const x of near) {
      // can the vertex see the bone through the body? cast from past the cloth's thickness, so a
      // shell's own inner wall (kept at cuffs and collars) doesn't count
      ray.origin.copy(_p).addScaledVector(_n, -0.05);
      ray.direction.subVectors(x.c, ray.origin);
      const len = ray.direction.length();
      ray.direction.multiplyScalar(1 / Math.max(len, 1e-6));
      const hit = len > 0.03 ? bvh.raycastFirst(ray, THREE.DoubleSide) : null;
      x.blocked = !!(hit && hit.distance > 0.02 && hit.distance < len - 0.02);
    }
    let ok = near.filter((x) => !x.blocked);
    if (!ok.length) ok = [near.reduce((m, x) => (x.d < m.d ? x : m), near[0])];
    let sum = 0;
    for (const x of ok) { x.w = 1 / (Math.pow(Math.max(x.d, 0.01), 4)); sum += x.w; }
    ok.forEach((x, k) => { if (k < 32) { I[v * 32 + k] = byName[x.b].userData.index; W[v * 32 + k] = x.w / sum; } });
  }
  // smooth: average with the 1-ring neighbours a few times (pieces don't share vertices)
  const ix = g.index.array, nb = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < ix.length; t += 3) for (let j = 0; j < 3; j++) { const a = ix[t + j], b = ix[t + (j + 1) % 3]; nb[a].add(b); nb[b].add(a); }
  let cur = toMaps(W, I, n);
  for (let it = 0; it < 3; it++) {
    const next = new Array(n);
    for (let v = 0; v < n; v++) {
      const m = new Map(cur[v]);
      for (const [k, w] of m) m.set(k, w * 2);
      let tot = 2;
      for (const u of nb[v]) { for (const [k, w] of cur[u]) m.set(k, (m.get(k) || 0) + w); tot++; }
      for (const [k, w] of m) m.set(k, w / tot);
      next[v] = m;
    }
    cur = next;
  }
  const index = new Uint16Array(n * 4), weight = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const top = [...cur[v]].sort((a, b) => b[1] - a[1]).slice(0, 4).filter((x) => x[1] > 0.02);
    const s = top.reduce((a, x) => a + x[1], 0) || 1;
    top.forEach(([k, w], j) => { index[v * 4 + j] = k; weight[v * 4 + j] = w / s; });
  }
  return { index, weight };
}
function toMaps(W, I, n) {
  const out = new Array(n);
  for (let v = 0; v < n; v++) { const m = new Map(); for (let k = 0; k < 32; k++) { const b = I[v * 32 + k]; if (b < 0) break; m.set(b, (m.get(b) || 0) + W[v * 32 + k]); } out[v] = m; }
  return out;
}
