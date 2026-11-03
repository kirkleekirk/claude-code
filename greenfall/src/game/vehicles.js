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
