// Holdfast — entry point: renderer, quality, world generation, game loop.
import * as THREE from 'three';
import { Sky } from './world/sky.js';
import { World } from './world/world.js';
import { Water } from './world/water.js';
import { Physics } from './physics.js';
import { updateWind } from './world/vegetation.js';
import { setTextureQuality } from './textures.js';
import { setAtlasSize } from './atlas.js';
import { Input } from './input.js';
import { ThirdPersonCamera } from './camera.js';
import { Player } from './player.js';
import { loadCharacterModels, Character, PALETTES } from './characters.js';
import { FEATURES } from './world/layout.js';

export const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

export function detectQuality() {
  const q = new URLSearchParams(location.search).get('q');
  const mobile = isTouch || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const level = q || (mobile ? 'low' : 'high');
  return {
    level,
    mobile,
    pixelRatio: level === 'low' ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 2),
    shadowSize: level === 'low' ? 1024 : 2048,
    shadowRange: level === 'low' ? 38 : 60,
    viewDistance: level === 'low' ? 380 : 620,
    texSize: level === 'low' ? 256 : 512,
    grass: level === 'low' ? 0.4 : 1,
    antialias: level !== 'low',
  };
}

export class Game {
  constructor(canvasParent, onProgress) {
    this.quality = detectQuality();
    setTextureQuality(this.quality.texSize >= 512 ? 1 : 0.5);
    setAtlasSize(this.quality.texSize);
    this.onProgress = onProgress || (() => {});
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: this.quality.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(this.quality.pixelRatio);
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    canvasParent.appendChild(r.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 5000);
    this.clock = new THREE.Clock();
    this.systems = [];
    addEventListener('resize', () => this.resize());
  }
  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
  }
  async init() {
    this.sky = new Sky(this.scene, this.renderer, this.quality);
    this.physics = new Physics(null);
    this.world = new World(this.scene, this.physics, this.onProgress);
    await this.world.generate({ texSize: this.quality.texSize, quality: this.quality });
    this.water = new Water(this.scene, this.world.terrain);
    this.onProgress('Waking survivors', 0.92);
    await loadCharacterModels({
      man: { url: new URL('../assets/models/man.glb', import.meta.url).href, height: 1.78 },
      woman: { url: new URL('../assets/models/woman.glb', import.meta.url).href, height: 1.68 },
    });
    this.input = new Input(this.renderer.domElement);
    this.input.wantLock = !this.quality.mobile;
    this.tpc = new ThirdPersonCamera(this.camera, this.physics);
    const ch = new Character('man', PALETTES.survivorM);
    this.scene.add(ch.root);
    this.player = new Player(this, ch);
    this.player.spawn(FEATURES.spawn[0], FEATURES.spawn[1]);
    this.tpc.yaw = Math.PI / 2; // face west toward the hills? (0 = -Z)
    this.onProgress('Ready', 1);
  }
  // all interactable doors in the world
  get doors() { return this.world.doors; }
  update(dt) {
    const inp = this.input;
    if (inp && !this.freeCam) {
      const ld = inp.lookDelta();
      if (inp.locked || inp.touch.active || inp.mouse.buttons & 4) this.tpc.look(ld.x, ld.y, inp.touch.active);
      this.player.update(dt, inp, this.tpc);
      this.tpc.update(dt, this.player.char.root.position, this.player.aiming, this.player.crouch);
      this.focus = this.player.pos;
    }
    for (const s of this.systems) s.update && s.update(dt);
    for (const d of this.world.doors) d.update(dt);
    this.sky.update(dt, this.focus || this.camera.position);
    this.water.update(dt, this.sky);
    this.world.update(dt, this.camera.position);
    updateWind(dt, this.sky.w.wind);
  }
  render() { this.renderer.render(this.scene, this.camera); }
  start() {
    const loop = () => {
      const dt = Math.min(0.05, this.clock.getDelta());
      this.update(dt);
      this.render();
      if (this.input) this.input.endFrame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}
