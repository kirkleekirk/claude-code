// Vehicle models: drop plane, riverboat "Magnolia", evac helicopter, supply parachute.
import * as THREE from 'three';
import { M } from './character.js';

export function makePlane() {
  const g = new THREE.Group();
  const body = M(0x6a7a5a, { rough: 0.6, metal: 0.3 }), dark = M(0x3a3f44, { metal: 0.5 }), stripe = M(0xd8c04a);
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 1.6, 22, 14), body); fus.rotation.x = Math.PI / 2; g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), body); nose.rotation.x = Math.PI / 2; nose.position.z = 11; g.add(nose);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(32, 0.4, 4), body); wing.position.set(0, 0.8, 2); g.add(wing);
  const tailW = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 2.4), body); tailW.position.set(0, 0.6, -10.5); g.add(tailW);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 4.5, 3), body); fin.position.set(0, 2.6, -10.5); g.add(fin);
  const st = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.6, 0.1), stripe); st.position.set(0, 0.4, 0); st.rotation.y = Math.PI / 2; void st;
  g.props = [];
  for (const sx of [-6.5, 6.5]) {
    const eng = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, 3.5, 10), dark); eng.rotation.x = Math.PI / 2; eng.position.set(sx, 0.5, 4); g.add(eng);
    const prop = new THREE.Group(); prop.position.set(sx, 0.5, 5.9);
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.4, 0.08), dark); b.rotation.z = (k / 3) * Math.PI * 2; prop.add(b); }
    g.add(prop); g.props.push(prop);
  }
  const win = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.9, 1.2), M(0x2a3a4a, { rough: 0.2 })); win.position.set(0, 1.4, 9.5); g.add(win);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeBoat() {
  const g = new THREE.Group();
  const white = M(0xf2efe6, { rough: 0.7 }), red = M(0xa3302a), black = M(0x1e1e1e, { rough: 0.5 }), wood = M(0x8a6a48);
  const hull = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 34), white); hull.position.y = 0.5; g.add(hull);
  const hullBot = new THREE.Mesh(new THREE.BoxGeometry(11.6, 1.2, 33.6), red); hullBot.position.y = -0.8; g.add(hullBot);
  const deck1 = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.3, 34.5), wood); deck1.position.y = 2.1; g.add(deck1);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(10, 3, 24), white); cabin.position.set(0, 3.7, -1); g.add(cabin);
  const deck2 = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 26), wood); deck2.position.set(0, 5.3, -1); g.add(deck2);
  const pilot = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 5), white); pilot.position.set(0, 6.6, 6); g.add(pilot);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.3, 5.6), red); roof.position.set(0, 7.9, 6); g.add(roof);
  for (let k = 0; k < 10; k++) { const w = new THREE.Mesh(new THREE.BoxGeometry(10.1, 1.2, 1), M(0xffe8a0, { emissive: 0.6 })); w.position.set(0, 3.9, -11 + k * 2.3); g.add(w); }
  for (const sx of [-2, 2]) {
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 9, 10), black); stack.position.set(sx, 9.5, 2); g.add(stack);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 1, 10), black); crown.position.set(sx, 14.3, 2); g.add(crown);
  }
  const wheel = new THREE.Group(); wheel.position.set(0, 1.2, -19);
  for (let k = 0; k < 10; k++) { const p = new THREE.Mesh(new THREE.BoxGeometry(10, 0.3, 3.2), red); p.rotation.x = (k / 10) * Math.PI * 2; p.position.set(0, Math.sin((k / 10) * Math.PI * 2) * 1.6, Math.cos((k / 10) * Math.PI * 2) * 1.6); p.rotation.x = -(k / 10) * Math.PI * 2; wheel.add(p); }
  g.add(wheel); g.wheel = wheel;
  // railings
  for (const sx of [-6.2, 6.2]) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 34), white); r.position.set(sx, 3.1, 0); g.add(r); for (let k = -16; k <= 16; k += 1.5) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1, 0.08), white); p.position.set(sx, 2.6, k); g.add(p); } }
  const name = makeTextPlane('THE MAGNOLIA', 10, 1.4, '#a3302a', '#f2efe6'); name.position.set(6.06, 0.9, 0); name.rotation.y = Math.PI / 2; g.add(name);
  const name2 = name.clone(); name2.position.x = -6.06; name2.rotation.y = -Math.PI / 2; g.add(name2);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
export function makeTextPlane(text, w, h, fg, bg) {
  const c = document.createElement('canvas'); c.width = 512; c.height = Math.round(512 * h / w);
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = fg; x.font = `${Math.floor(c.height * 0.7)}px "Lilita One", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, c.width / 2, c.height / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
}

export function makeHeli() {
  const g = new THREE.Group();
  const body = M(0x3a4a3a, { rough: 0.5, metal: 0.3 }), dark = M(0x1e1e1e), glass = M(0x2a3a4a, { rough: 0.1, metal: 0.3 });
  const cab = new THREE.Mesh(new THREE.SphereGeometry(2.2, 16, 12), body); cab.scale.set(1, 0.9, 1.7); cab.position.y = 2; g.add(cab);
  const win = new THREE.Mesh(new THREE.SphereGeometry(1.8, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2.3), glass); win.rotation.x = Math.PI / 2.4; win.position.set(0, 2.4, 2.4); g.add(win);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 8, 8), body); boom.rotation.x = Math.PI / 2; boom.position.set(0, 2.4, -6); g.add(boom);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.2, 1.2), body); fin.position.set(0, 3.3, -9.8); g.add(fin);
  for (const sx of [-1.3, 1.3]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 5), dark); sk.position.set(sx, 0.1, 0.4); g.add(sk); for (const sz of [-1, 1.6]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, 0.1), dark); st.position.set(sx * 0.9, 0.5, sz); g.add(st); } }
  const rotor = new THREE.Group(); rotor.position.y = 4.2;
  for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(14, 0.06, 0.45), dark); b.rotation.y = (k / 4) * Math.PI * 2; rotor.add(b); }
  g.add(rotor); g.rotor = rotor;
  const tr = new THREE.Group(); tr.position.set(0.3, 3.3, -9.8);
  for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.2, 0.25), dark); b.rotation.x = k * Math.PI / 2; tr.add(b); }
  g.add(tr); g.tailRotor = tr;
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), M(0xff3020, { emissive: 3 })); light.position.set(0, 0.5, -10); g.add(light);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.45, 0.4, 0.1), M(0xf0f0f0)); stripe.position.set(0, 2, 0); stripe.rotation.y = Math.PI / 2; void stripe;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makeParachuteCrate() {
  const g = new THREE.Group();
  const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 1.2), M(0x3f5a32));
  g.add(crate);
  const chute = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xe8e0d0, { rough: 0.9 }));
  chute.material.side = THREE.DoubleSide;
  chute.position.y = 5; g.add(chute); g.chute = chute;
  for (let k = 0; k < 4; k++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 4.5), M(0x333333)); const a = (k / 4) * Math.PI * 2 + Math.PI / 4; l.position.set(Math.cos(a) * 1.4, 2.8, Math.sin(a) * 1.4); l.rotation.z = Math.cos(a) * 0.5; l.rotation.x = -Math.sin(a) * 0.5; g.add(l); }
  return g;
}

// ---------------------------------------------------------------------------------
// Drivable vehicles (forward = +z). Returned groups expose wheel pivots for animation.
export function makeDirtBike(paint = { body: 0xe8702a, accent: 0x1e1e1e }) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: paint.body, roughness: 0.45, metalness: 0.15 });
  const accM = new THREE.MeshStandardMaterial({ color: paint.accent, roughness: 0.5, metalness: 0.2 });
  const frameM = M(0x2a2c30, { rough: 0.4, metal: 0.6 }), chrome = M(0xc8ccd0, { rough: 0.25, metal: 0.9 }), tire = M(0x161616, { rough: 0.9 }), seatM = M(0x141414, { rough: 0.7 });
  const box = (w, h, d, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.rotation.x = rx; g.add(o); return o; };
  const beam = (a, b, r, m) => { const d = new THREE.Vector3().subVectors(b, a); const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 6), m); o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); g.add(o); return o; };
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const wheel = (z) => {
    const w = new THREE.Group(); w.position.set(0, 0.36, z);
    const t = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.075, 8, 18), tire); t.rotation.y = Math.PI / 2; w.add(t);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.14, 8), chrome); hub.rotation.z = Math.PI / 2; w.add(hub);
    for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.5, 0.015), chrome); sp.rotation.x = (k / 6) * Math.PI; w.add(sp); }
    g.add(w); return w;
  };
  g.rear = wheel(-0.68);
  g.steerPivot = new THREE.Group(); g.steerPivot.position.set(0, 0, 0.72); g.add(g.steerPivot);
  g.front = wheel(0); g.remove(g.front); g.front.position.set(0, 0.36, 0.14); g.steerPivot.add(g.front);
  // frame
  beam(V(0, 0.5, -0.1), V(0, 0.95, 0.55), 0.035, frameM);
  beam(V(0, 0.5, -0.1), V(0, 0.85, -0.45), 0.03, frameM);
  beam(V(0.08, 0.38, -0.68), V(0.06, 0.55, -0.05), 0.025, frameM); beam(V(-0.08, 0.38, -0.68), V(-0.06, 0.55, -0.05), 0.025, frameM);
  box(0.24, 0.26, 0.34, M(0x4a4e54, { metal: 0.6, rough: 0.4 }), 0, 0.52, 0.05);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), bodyM); tank.scale.set(1.1, 0.8, 1.6); tank.position.set(0, 0.92, 0.22); g.add(tank);
  box(0.2, 0.08, 0.62, seatM, 0, 0.95, -0.28, -0.08);
  box(0.24, 0.05, 0.5, bodyM, 0, 0.9, -0.66, 0.25);
  box(0.22, 0.12, 0.08, accM, 0.13, 0.82, -0.22); box(0.22, 0.12, 0.08, accM, -0.13, 0.82, -0.22);
  beam(V(0.13, 0.45, -0.05), V(0.14, 0.62, -0.62), 0.035, chrome);
  // steering: forks, bars, front fender, number plate, headlight
  const sp = g.steerPivot;
  const fork = (x) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.85, 6), chrome); o.position.set(x, 0.75, 0.06); o.rotation.x = -0.35; sp.add(o); };
  fork(0.09); fork(-0.09);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.78, 6), frameM); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.17, -0.08); sp.add(bar);
  for (const x of [-0.36, 0.36]) { const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.12, 6), seatM); gr.rotation.z = Math.PI / 2; gr.position.set(x, 1.17, -0.08); sp.add(gr); }
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.5), bodyM); fender.position.set(0, 0.74, 0.16); fender.rotation.x = 0.2; sp.add(fender);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.24, 0.03), accM); plate.position.set(0, 1.02, 0.12); plate.rotation.x = -0.3; sp.add(plate);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10), M(0xfff4c8, { emissive: 0.8 })); lamp.rotation.x = Math.PI / 2 - 0.3; lamp.position.set(0, 0.98, 0.15); sp.add(lamp);
  g.paintMats = [bodyM, accM];
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export function makePickupTruck(color = 0x2e5c8a) {
  const g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25 });
  const dark = M(0x1e1e1e, { rough: 0.8 }), glass = M(0x2a3a48, { rough: 0.15, metal: 0.4 }), chrome = M(0xc0c4c8, { rough: 0.3, metal: 0.8 });
  const box = (w, h, d, m, x, y, z) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); g.add(o); return o; };
  box(2.0, 0.75, 5.6, paint, 0, 0.85, 0.05);
  box(1.86, 0.85, 1.7, paint, 0, 1.62, 0.35);
  box(1.88, 0.6, 0.05, glass, 0, 1.68, 1.22); box(0.04, 0.5, 1.2, glass, 0.94, 1.68, 0.35); box(0.04, 0.5, 1.2, glass, -0.94, 1.68, 0.35); box(1.6, 0.5, 0.04, glass, 0, 1.7, -0.5);
  box(2.0, 0.45, 0.08, paint, 0, 1.4, -2.65); box(0.08, 0.45, 2.1, paint, 0.96, 1.4, -1.6); box(0.08, 0.45, 2.1, paint, -0.96, 1.4, -1.6);
  box(1.84, 0.06, 2.1, dark, 0, 1.2, -1.6);
  box(2.06, 0.22, 0.18, chrome, 0, 0.62, 2.88); box(2.06, 0.22, 0.18, chrome, 0, 0.62, -2.78);
  box(1.4, 0.32, 0.06, dark, 0, 0.95, 2.86);
  for (const x of [-0.72, 0.72]) box(0.32, 0.16, 0.05, M(0xfff4c8, { emissive: 0.8 }), x, 1.0, 2.86);
  for (const x of [-0.75, 0.75]) box(0.25, 0.14, 0.05, M(0xc02020, { emissive: 0.4 }), x, 1.05, -2.7);
  const wheel = (x, z) => {
    const w = new THREE.Group(); w.position.set(x, 0.45, z);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.32, 14), dark); t.rotation.z = Math.PI / 2; w.add(t);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.34, 10), chrome); r.rotation.z = Math.PI / 2; w.add(r);
    g.add(w); return w;
  };
  g.wheels = [wheel(-0.95, 1.75), wheel(0.95, 1.75), wheel(-0.95, -1.75), wheel(0.95, -1.75)];
  g.frontWheels = g.wheels.slice(0, 2);
  g.paintMats = [paint];
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
