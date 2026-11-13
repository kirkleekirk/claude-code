// Weather you can see: rain as streaks around the camera and rings where the
// drops land, a bolt for each lightning strike, the ground getting wet and
// drying out again; and the small life of fair weather, leaves coming down
// from the trees and fireflies over the grass after dark.
import * as THREE from 'three';
import { GFX, COVER_GLSL, skyAndEffects } from '../gfx/globals.js';
import { Cover } from '../gfx/cover.js';
import { T } from './terrain.js';

const BOX = [34, 22, 34], SPLASH = 26;

const STREAK_VS = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uCam; uniform float uTime; uniform vec3 uFall; uniform float uAmount;
${COVER_GLSL}
varying float vA; varying vec2 vUv;
void main() {
	vec3 box = vec3( ${BOX.map((v) => v.toFixed(1)).join(', ')} );
	// each drop falls through a box that wraps round the camera
	vec3 p = aSeed.xyz * box + uFall * ( uTime * ( 0.85 + 0.3 * aSeed.w ) );
	p = mod( p - uCam + box * 0.5, box ) - box * 0.5 + uCam;
	vec3 dir = normalize( uFall ), toCam = cameraPosition - p;
	float far = length( toCam );
	vec3 wp = p - dir * ( position.y * ( 0.45 + 0.5 * aSeed.w ) ) + normalize( cross( dir, toCam ) ) * ( position.x * 0.0055 * ( 1.0 + far * 0.06 ) );
	// fewer in light rain; none under a roof; thinning toward the edge of the box
	float show = step( fract( aSeed.w * 7.31 ), uAmount ) * step( hfCoverTop( p.xz ) + 0.12, p.y );
	vA = show * ( 1.0 - smoothstep( box.x * 0.34, box.x * 0.5, length( toCam.xz ) ) ) * smoothstep( 0.4, 1.6, far );
	vUv = position.xy;
	gl_Position = vA > 0.01 ? projectionMatrix * viewMatrix * vec4( wp, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;
const STREAK_FS = /* glsl */`
uniform vec3 uColor;
varying float vA; varying vec2 vUv;
void main() {
	float a = vA * ( 1.0 - abs( vUv.x ) ) * smoothstep( 0.0, 0.3, vUv.y ) * smoothstep( 1.0, 0.55, vUv.y );
	gl_FragColor = vec4( uColor, a * 0.5 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;
const SPLASH_VS = /* glsl */`
attribute vec4 aSeed;
uniform vec3 uCam; uniform float uTime; uniform float uAmount;
${COVER_GLSL}
varying float vPh; varying vec2 vUv; varying float vA;
void main() {
	float period = 0.4 + 0.3 * aSeed.w, t = uTime / period + aSeed.z * 17.0, turn = floor( t );
	vPh = fract( t );
	// somewhere new each time round, on whatever is highest there
	vec2 h = fract( sin( vec2( dot( aSeed.xy + turn, vec2( 12.9898, 78.233 ) ), dot( aSeed.yx + turn, vec2( 39.346, 11.135 ) ) ) ) * 43758.5453 );
	vec2 box = vec2( ${SPLASH.toFixed(1)} );
	vec2 p = mod( h * box - uCam.xz + box * 0.5, box ) - box * 0.5 + uCam.xz;
	float top = hfCoverTop( p ), size = ( 0.03 + 0.13 * vPh ) * ( 0.7 + 0.6 * aSeed.w );
	vA = step( fract( aSeed.z * 5.3 ), uAmount ) * step( - 1e4, top ) * ( 1.0 - smoothstep( box.x * 0.36, box.x * 0.5, distance( p, uCam.xz ) ) );
	vUv = position.xz;
	gl_Position = vA > 0.01 ? projectionMatrix * viewMatrix * vec4( p.x + position.x * size, top + 0.035, p.y + position.z * size, 1.0 ) : vec4( 2.0, 2.0, 2.0, 1.0 );
}`;
const SPLASH_FS = /* glsl */`
uniform vec3 uColor;
varying float vPh; varying vec2 vUv; varying float vA;
void main() {
	float r = length( vUv );
	// a ring spreading out, and at first a little crown where the drop hit
	float a = smoothstep( 0.2, 0.0, abs( r - 0.78 ) ) * ( 1.0 - vPh ) * ( 1.0 - vPh ) + smoothstep( 0.3, 0.0, r ) * smoothstep( 0.25, 0.0, vPh );
	gl_FragColor = vec4( uColor * 1.5, a * vA * 0.4 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;
const BOLT_FS = /* glsl */`
uniform vec3 uColor;
varying float vEdge;
void main() {
	gl_FragColor = vec4( uColor * ( 1.0 - abs( vEdge ) ) * ( 1.0 - abs( vEdge ) ), 1.0 );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`;

function seeds(n, seed) {
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const a = new Float32Array(n * 4);
  for (let i = 0; i < a.length; i++) a[i] = rnd();
  return a;
}

export class WeatherFx {
  constructor(game) {
    this.game = game;
    const scene = game.scene, q = game.quality, U = (extra) => ({ hfCover: { value: null }, hfCoverRect: { value: GFX.cover }, ...extra });
    this.cover = new Cover(game.renderer);
    this.color = new THREE.Color(0.5, 0.55, 0.6);
    this.time = 0;
    // rain streaks
    const n = Math.round(5200 * (q.particles || 1));
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(n, 77), 4));
    g.instanceCount = n;
    this.su = U({ uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uFall: { value: new THREE.Vector3(0, -9, 0) }, uAmount: { value: 0 }, uColor: { value: this.color } });
    this.su.hfCover.value = this.cover.tex;
    this.streaks = skyAndEffects(new THREE.Mesh(g, new THREE.ShaderMaterial({ vertexShader: STREAK_VS, fragmentShader: STREAK_FS, uniforms: this.su, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    // rings where it lands
    const m = Math.round(700 * (q.particles || 1));
    const g2 = new THREE.InstancedBufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1], 3));
    g2.setIndex([0, 2, 1, 0, 3, 2]);
    g2.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds(m, 191), 4));
    g2.instanceCount = m;
    this.pu = U({ uCam: this.su.uCam, uTime: this.su.uTime, uAmount: this.su.uAmount, uColor: { value: this.color } });
    this.pu.hfCover.value = this.cover.tex;
    this.splashes = skyAndEffects(new THREE.Mesh(g2, new THREE.ShaderMaterial({ vertexShader: SPLASH_VS, fragmentShader: SPLASH_FS, uniforms: this.pu, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
    for (const o of [this.streaks, this.splashes]) { o.frustumCulled = false; o.visible = false; o.renderOrder = 4; scene.add(o); }
    this.streaks.name = 'rain'; this.splashes.name = 'rainSplashes';
    // lightning: one ribbon, rebuilt for each strike
    this.boltMax = 220;
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.boltMax * 4 * 3), 3));
    bg.setAttribute('aEdge', new THREE.BufferAttribute(new Float32Array(this.boltMax * 4), 1));
    const bi = [];
    for (let i = 0; i < this.boltMax; i++) bi.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4 + 1, i * 4 + 3, i * 4 + 2);
    bg.setIndex(bi);
    this.boltColor = new THREE.Color(0, 0, 0);
    this.bolt = skyAndEffects(new THREE.Mesh(bg, new THREE.ShaderMaterial({
      vertexShader: 'attribute float aEdge; varying float vEdge; void main() { vEdge = aEdge; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }',
      fragmentShader: BOLT_FS, uniforms: { uColor: { value: this.boltColor } }, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    })));
    this.bolt.frustumCulled = false; this.bolt.visible = false; this.bolt.renderOrder = -5; this.bolt.name = 'lightning';
    scene.add(this.bolt);
    this.boltT = 9;
    this.wind = new THREE.Vector3();
    this.light = new THREE.Color();
    this.nearTrees = []; this.treeT = 0; this.strike = null;
  }
  // a strike somewhere out on the horizon; returns how far away (for the thunder)
  lightning() {
    const g = this.game, cam = g.camera.position, az = Math.random() * Math.PI * 2, dist = 450 + Math.random() * 800;
    const fx = cam.x + Math.cos(az) * dist, fz = cam.z + Math.sin(az) * dist;
    const inside = fx > T.x0 && fx < T.x1 && fz > T.z0 && fz < T.z1;
    const foot = new THREE.Vector3(fx, inside ? g.world.terrain.height(fx, fz) : cam.y - 8, fz);
    const head = new THREE.Vector3(fx + (Math.random() - 0.5) * 260, cam.y + 520, fz + (Math.random() - 0.5) * 260);
    // a jagged path by splitting each stretch at a nudged midpoint, with a couple of forks
    const paths = [];
    const grow = (a, b, sway, depth, width) => {
      let pts = [a, b];
      for (let d = 0; d < depth; d++) {
        const next = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const m = pts[i].clone().lerp(pts[i + 1], 0.35 + Math.random() * 0.3);
          m.x += (Math.random() - 0.5) * sway; m.z += (Math.random() - 0.5) * sway; m.y += (Math.random() - 0.5) * sway * 0.3;
          next.push(m, pts[i + 1]);
        }
        pts = next; sway *= 0.52;
      }
      paths.push({ pts, width });
      return pts;
    };
    const main = grow(head, foot, 150, 5, dist * 0.0032);
    for (let f = 0; f < 2; f++) {
      const from = main[6 + Math.floor(Math.random() * 14)];
      const to = from.clone().add(new THREE.Vector3((Math.random() - 0.5) * 240, -90 - Math.random() * 130, (Math.random() - 0.5) * 240));
      grow(from, to, 60, 4, dist * 0.0016);
    }
    const P = this.bolt.geometry.attributes.position, E = this.bolt.geometry.attributes.aEdge, side = new THREE.Vector3(), seg = new THREE.Vector3(), view = new THREE.Vector3();
    let n = 0;
    for (const { pts, width } of paths) for (let i = 0; i < pts.length - 1 && n < this.boltMax; i++, n++) {
      seg.subVectors(pts[i + 1], pts[i]); view.subVectors(pts[i], cam);
      side.crossVectors(seg, view).normalize().multiplyScalar(width);
      [[pts[i], -1], [pts[i], 1], [pts[i + 1], -1], [pts[i + 1], 1]].forEach(([p, s], k) => { P.setXYZ(n * 4 + k, p.x + side.x * s, p.y + side.y * s, p.z + side.z * s); E.setX(n * 4 + k, s); });
    }
    this.bolt.geometry.setDrawRange(0, n * 6);
    P.needsUpdate = true; E.needsUpdate = true;
    this.boltT = 0;
    return dist;
  }
  update(dt) {
    const g = this.game, sky = g.sky, cam = g.camera.position, rain = sky.w.rain, fx = g.fx;
    this.time += dt;
    // the ground wets in about half a minute of hard rain and takes a few minutes to dry
    const wet = GFX.misc[0];
    GFX.misc[0] = Math.max(0, Math.min(1, wet + (rain > 0.08 ? rain * dt / 28 : -dt / 200)));
    const active = rain > 0.02 || GFX.misc[0] > 0.02;
    if (active && this.cover.due(dt, cam)) {
      // people and moving cars are left out, or a dry patch would trail after them
      const hidden = [], hide = (o) => { if (o && o.visible) { o.visible = false; hidden.push(o); } };
      hide(g.player && g.player.char && g.player.char.root);
      for (const z of g.zombies.list) hide(z.char && z.char.root);
      if (g.society) for (const n of g.society.npcs) hide(n.char && n.char.root);
      if (g.vehicles) for (const v of g.vehicles.list) if (Math.abs(v.speed) > 0.5) hide(v.group);
      this.cover.render(g.scene, cam);
      for (const o of hidden) o.visible = true;
    }
    // rain leans with the wind
    const w = sky.w.wind;
    this.wind.set(0.8 * w * 3.2, 0, 0.6 * w * 3.2);
    this.su.uFall.value.set(this.wind.x * 1.1, -10.5, this.wind.z * 1.1);
    this.su.uCam.value.copy(cam);
    this.su.uTime.value = this.time;
    this.su.uAmount.value = Math.min(1, rain * 1.15);
    this.streaks.visible = this.splashes.visible = rain > 0.02;
    // lit by the sky, and for an instant by lightning
    const h = sky.hemi, k = h.intensity * 0.42 + GFX.misc[3] * 4;
    this.color.setRGB(0.78 * k * (0.5 + h.color.r), 0.82 * k * (0.5 + h.color.g), 0.9 * k * (0.5 + h.color.b));
    // the bolt: a hard flash, a flicker, gone
    this.boltT += dt;
    const b = this.boltT < 0.07 ? 1 : this.boltT < 0.13 ? 0.25 : this.boltT < 0.2 ? 0.7 : this.boltT < 0.34 ? 0.34 * (1 - (this.boltT - 0.2) / 0.14) : 0;
    this.bolt.visible = b > 0;
    this.boltColor.setRGB(36 * b, 40 * b, 52 * b);
    if (!fx) return;
    // what falls on smoke, dust and leaves
    const sun = sky.sun;
    this.light.copy(h.color).multiplyScalar(h.intensity * 0.5).add(new THREE.Color().copy(sun.color).multiplyScalar(sun.intensity * 0.3));
    // leaves come down where there are trees, more of them when it blows
    this.treeT -= dt;
    if (this.treeT <= 0) {
      this.treeT = 2;
      this.nearTrees.length = 0;
      const tr = g.world.trees;
      if (tr) tr.items.forEach((list, kind) => { if (kind === 4 || kind === 5 || kind === 6) return; for (const t of list) if (Math.abs(t.x - cam.x) < 34 && Math.abs(t.z - cam.z) < 34) this.nearTrees.push([t, kind]); });
    }
    if (this.nearTrees.length && rain < 0.5) {
      let n = (0.25 + w * 1.6) * Math.min(1, this.nearTrees.length / 5) * dt * fx.rate;
      n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const [t, kind] = this.nearTrees[Math.floor(Math.random() * this.nearTrees.length)];
        const fall = kind >= 7, r = Math.random();
        const color = kind === 9 ? [0.62, 0.13, 0.06] : fall ? (r < 0.5 ? [0.78, 0.4, 0.07] : [0.7, 0.55, 0.1]) : (r < 0.6 ? [0.62, 0.52, 0.1] : [0.3, 0.42, 0.1]);
        if (!fall && Math.random() < 0.55) continue; // green trees shed less
        const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * t.canopy * t.s * 0.7;
        fx.emit('leaf', t.x + Math.cos(a) * rr, t.y + (4.5 + Math.random() * 4) * t.s, t.z + Math.sin(a) * rr, { color });
      }
    }
    // fireflies over rough grass on a dry night
    const G = g.world.ground;
    if (G && sky.darkness > 0.45 && rain < 0.05 && GFX.misc[0] < 0.3) {
      let n = 2.4 * sky.darkness * dt * fx.rate;
      n = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const x = cam.x + (Math.random() - 0.5) * 44, z = cam.z + (Math.random() - 0.5) * 44;
        const gi = Math.floor(x - T.x0), gj = Math.floor(z - T.z0);
        if (gi < 0 || gj < 0 || gi >= G.W || gj >= G.H) continue;
        const d = G.data, o = (gj * G.W + gi) * 4;
        if (d[o] < 150 || d[o + 3] > 100) continue; // grass, and not a mown lawn
        fx.emit('firefly', x, g.world.terrain.height(x, z) + 0.4 + Math.random() * 1.3, z);
      }
    }
    fx.update(dt, this.wind, this.light);
  }
}
