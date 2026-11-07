// Holdfast — entry point: renderer, quality, world generation, game loop and
// the glue between player, zombies, claims, build mode and UI.
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
import { HUD } from './hud.js';
import { Inventory, Interaction, Combat } from './gameplay.js';
import { Zombies } from './zombies.js';
import { Claims } from './claims.js';
import { BuildMode } from './buildmode.js';
import { MapView } from './map.js';
import { Audio } from './audio.js';
import { saveGame, loadGame, clearSave, hasSave } from './save.js';

import { isTouch } from './platform.js';
export { isTouch };

export function detectQuality() {
  let stored = null;
  try { stored = localStorage.getItem('holdfast.quality'); } catch (e) { /* ignore */ }
  const q = new URLSearchParams(location.search).get('q') || stored;
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

const WEAPONS = {
  bat: { kind: 'bat', name: 'Baseball bat', damage: 38, reach: 2.0, speed: 0.6 },
  pistol: { kind: 'gun', name: 'Pistol', damage: 45, reach: 0, speed: 0.32 },
};

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
    this.day = 1;
    this.customShapes = {};
    this.customStyles = {};
    this.dirtyT = -1;
    this.autosaveT = 60;
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
    this.onProgress('Waking survivors', 0.94);
    // a host page may point at other copies of the models (e.g. .gltf JSON)
    const urls = window.HOLDFAST_MODELS || {};
    await loadCharacterModels({
      man: { url: urls.man || new URL('../assets/models/man.glb', import.meta.url).href, height: 1.78 },
      woman: { url: urls.woman || new URL('../assets/models/woman.glb', import.meta.url).href, height: 1.68 },
    });
    this.input = new Input(this.renderer.domElement);
    this.input.wantLock = !this.quality.mobile;
    this.tpc = new ThirdPersonCamera(this.camera, this.physics);
    const ch = new Character('man', PALETTES.survivorM);
    this.scene.add(ch.root);
    this.player = new Player(this, ch);
    this.player.spawn(FEATURES.spawn[0], FEATURES.spawn[1]);
    this.tpc.yaw = -Math.PI / 2; // looking east toward town
    this.inventory = new Inventory();
    this.hud = new HUD(this);
    this.interaction = new Interaction(this);
    this.combat = new Combat(this);
    this.zombies = new Zombies(this);
    this.claims = new Claims(this);
    this.buildMode = new BuildMode(this);
    this.map = new MapView(this);
    this.audio = new Audio();
    this.sky.onThunder = () => setTimeout(() => this.audio.thunder(), 600 + Math.random() * 1500);
    // flashlight
    this.flashlight = new THREE.SpotLight(0xfff4dc, 0, 28, 0.42, 0.45, 1.4);
    this.scene.add(this.flashlight, this.flashlight.target);
    this.player.flashlightOn = false;
    this.setWeapon('bat');
    const loaded = !new URLSearchParams(location.search).get('fresh') && loadGame(this);
    this.onProgress('Ready', 1);
    if (!loaded) {
      setTimeout(() => this.hud.toast("Welcome to Bridger County. Find a place worth holding, then press G to plant your claim flag.", 7), 800);
      setTimeout(() => this.hud.toast(isTouch ? 'Left side: move · Right side: look · Buttons: hit, use, jump' : 'WASD move · Mouse look · Click to swing · E to use · Esc for help', 6), 4000);
    } else {
      setTimeout(() => this.hud.toast('Welcome back. Your claims are where you left them.', 4), 800);
    }
  }
  setWeapon(k) {
    if (k === 'pistol' && !this.inventory.weapons.pistol) return;
    this.player.weapon = { ...WEAPONS[k] };
  }
  markDirty() { this.dirtyT = 4; }
  save() { return saveGame(this); }
  newGame() { clearSave(); location.reload(); }
  respawn() {
    const p = this.player;
    const c = this.claims.list[0];
    const at = c ? [c.flag[0] + 1.5, c.flag[2] + 1.5] : FEATURES.spawn;
    p.spawn(at[0], at[1]);
    p.char.root.rotation.x = 0;
    this.inventory.res.food = Math.floor(this.inventory.res.food / 2);
    this.inventory.res.ammo = Math.floor(this.inventory.res.ammo / 2);
    for (const z of this.zombies.list) if (z.pos.distanceTo(p.pos) < 35) { z.dead = true; z.deadT = 25; }
    this.hud.hideDeath();
    this.hud.toast('You came to, aching. Some supplies are gone.', 3);
  }
  onPlayerDeath() {
    setTimeout(() => this.hud.showDeath('The dead got you this time. Half your food and ammo went with you.'), 1500);
  }
  onKill() { this.zombies.kills++; }

  handleKeys() {
    const inp = this.input, hud = this.hud;
    if (inp.pressed('Escape')) {
      if (this.buildMode.designer && !this.buildMode.designer.el.hidden) this.buildMode.designer.close();
      else if (!this.map.el.hidden) this.map.toggle(false);
      else if (!this.buildMode.active) hud.togglePause();
    }
    if (hud.paused || this.player.dead) return;
    if (inp.pressed('KeyM') && !this.buildMode.active) this.map.toggle();
    if (this.modalOpen) return;
    if (inp.pressed('KeyB') && !this.buildMode.active) {
      const c = this.claims.at(this.player.pos.x, this.player.pos.z);
      if (c) { this.buildMode.enter(c); inp.pressedSet.delete('KeyB'); }
      else hud.toast(this.claims.list.length ? 'Walk back inside your claim to build.' : 'Plant a claim flag first (G).', 2.5);
    }
    if (this.buildMode.active) return;
    if (inp.pressed('KeyG')) {
      const f = this.tpc.forward;
      this.claims.plant(this.player.pos.x + f.x * 2, this.player.pos.z + f.z * 2);
    }
    if (inp.pressed('KeyQ')) {
      if (this.player.weapon.kind === 'gun') this.setWeapon('bat');
      else if (this.inventory.weapons.pistol) this.setWeapon('pistol');
      else hud.toast('You only have the bat. Pistols turn up in houses and stores.', 2.5);
    }
    if (inp.pressed('KeyF')) { this.player.flashlightOn = !this.player.flashlightOn; }
    if (inp.pressed('KeyH')) {
      const p = this.player, inv = this.inventory;
      if (p.health >= p.maxHealth) hud.toast("You're not hurt.", 1.5);
      else if (inv.res.meds > 0 && p.health < 60) { inv.res.meds--; p.heal(45); hud.toast('Patched up (+45 health)', 2); }
      else if (inv.res.food > 0) { inv.res.food--; p.heal(15); p.stamina = p.maxStamina; hud.toast('Ate something (+15 health)', 2); }
      else if (inv.res.meds > 0) { inv.res.meds--; p.heal(45); hud.toast('Patched up (+45 health)', 2); }
      else hud.toast('No food or meds.', 1.5);
    }
    if (inp.pressed('KeyI')) {
      const r = this.inventory.res;
      hud.toast(`Pack: ${r.wood} wood, ${r.metal} metal, ${r.stone} stone, ${r.food} food, ${r.meds} meds, ${r.ammo} ammo, ${r.fuel} fuel · ${this.inventory.claimKits} claim kit(s)`, 4);
    }
  }

  update(dt) {
    const inp = this.input;
    if (inp && this.hud) {
      this.handleKeys();
      if (this.hud.paused) return;
    }
    if (inp && !this.freeCam) {
      if (this.buildMode.active) {
        this.buildMode.update(dt);
        this.player.char.animate(dt, { speed: 0, mode: 'idle', weapon: this.player.weapon.kind === 'gun' ? 'gun' : 'bat' });
        this.player.syncModel(dt);
      } else if (!this.modalOpen) {
        const ld = inp.lookDelta();
        const dragging = !inp.locked && (inp.mouse.buttons & 1) && inp.dragMoved;
        if (inp.locked || inp.touch.active || (inp.mouse.buttons & 4) || dragging) this.tpc.look(ld.x, ld.y, inp.touch.active);
        this.player.update(dt, inp, this.tpc);
        // guns fire on the attack input
        if (this.player.weapon.kind === 'gun' && this.player.attackT >= 0 && !this.player._shotFired) { this.combat.shoot(this.player); this.player._shotFired = true; }
        if (this.player.attackT < 0) this.player._shotFired = false;
        this.tpc.update(dt, this.player.char.root.position, this.player.aiming, this.player.crouch);
        this.interaction.update(dt);
        this.zombies.update(dt);
      }
      this.focus = this.player.pos;
      this.combat.update(dt);
      this.claims.update(dt);
      this.hud.update(dt);
      // flashlight follows the view
      const fl = this.flashlight;
      fl.intensity = this.player.flashlightOn && !this.buildMode.active ? 40 : 0;
      if (fl.intensity) {
        const f = new THREE.Vector3(); this.camera.getWorldDirection(f);
        fl.position.copy(this.player.pos).add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(f, 0.3);
        fl.target.position.copy(fl.position).addScaledVector(f, 10);
        fl.target.updateMatrixWorld();
      }
      if (this.sky.darkness > 0.75 && !this.player.flashlightOn && !this._flHint) { this._flHint = true; this.hud.toast('It is getting dark. Press F for your flashlight.', 4); }
      // autosave
      if (this.dirtyT > 0) { this.dirtyT -= dt; if (this.dirtyT <= 0) this.save(); }
      this.autosaveT -= dt;
      if (this.autosaveT <= 0) { this.autosaveT = 60; this.save(); }
      this.audio.setWind(this.sky.w.wind, this.sky.w.rain);
    }
    for (const s of this.systems) s.update && s.update(dt);
    for (const d of this.world.doors) d.update(dt);
    const before = this.sky.time;
    this.sky.update(dt, this.focus || this.camera.position);
    if (this.sky.time < before) this.day++;
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
export { hasSave };
