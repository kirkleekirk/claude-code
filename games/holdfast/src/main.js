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
import { SurvivorSetup, SPAWNS, traitMods, profilePalette } from './survivor.js';
import { START_RES } from './gameplay.js';
import { Society } from './npc/society.js';
import { CommandView } from './command.js';

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
    this.mods = traitMods([]);
    this.profile = null;
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
    this.society = new Society(this);
    this.command = new CommandView(this);
    this.sky.onThunder = () => setTimeout(() => this.audio.thunder(), 600 + Math.random() * 1500);
    // flashlight
    this.flashlight = new THREE.SpotLight(0xfff4dc, 0, 28, 0.42, 0.45, 1.4);
    this.scene.add(this.flashlight, this.flashlight.target);
    this.player.flashlightOn = false;
    this.setWeapon('bat');
    const qs = new URLSearchParams(location.search);
    const loaded = !qs.get('fresh') && loadGame(this);
    // a save from before there were other people: two of them find you
    if (loaded && !this.society.loaded && !qs.get('still')) this.society.startingCompanions(this.player.pos);
    this.onProgress('Ready', 1);
    // phones start in the top view (and keep whichever view you used last)
    let pref = null;
    try { pref = localStorage.getItem('holdfast.view'); } catch (e) { /* storage blocked */ }
    const wantCmd = qs.get('view') ? qs.get('view') === 'command' : !qs.get('still') && (pref ? pref === 'command' : isTouch);
    this.startView = () => { if (wantCmd) this.command.toggle(true); };
    if (loaded && !this.profile && !qs.get('still')) {
      // a save from before survivors existed: make one, keep everything else
      this.setupOpen = true;
      this.hud.setVisible(false);
      new SurvivorSetup(this, (p) => {
        this.setupOpen = false;
        this.hud.setVisible(true);
        this.applyProfile(p, false);
        this.save();
        this.startView();
        setTimeout(() => this.hud.toast(`Welcome back, ${p.name.split(' ')[0]}. Your claims are where you left them.`, 4), 600);
      }, { keepPlace: true });
    } else if (loaded) {
      this.startView();
      setTimeout(() => this.hud.toast(`Welcome back${this.profile ? ', ' + this.profile.name.split(' ')[0] : ''}. Your claims are where you left them.`, 4), 800);
    } else if (qs.get('still') && !qs.get('setup')) {
      // automated checks skip the creation screens
      this.applyProfile({ name: 'Test Survivor', model: 'man', skin: PALETTES.survivorM[0], shirt: PALETTES.survivorM[1], pants: PALETTES.survivorM[2], hair: PALETTES.survivorM[4], traits: [], spawn: 'highway' }, true);
      if (qs.get('npcs') !== '0') this.society.startingCompanions(this.player.pos);
      this.startView();
    } else {
      // a new game: make a survivor, then pick where to start
      this.setupOpen = true;
      this.hud.setVisible(false);
      new SurvivorSetup(this, (p) => {
        this.setupOpen = false;
        this.hud.setVisible(true);
        this.applyProfile(p, true);
        this.society.startingCompanions(this.player.pos);
        this.save();
        this.startView();
        const cmd = this.command.active;
        setTimeout(() => this.hud.toast(`${p.name.split(' ')[0]}, two survivors are with you. Find a place worth holding, then ${isTouch ? 'tap Claim to plant your flag' : 'press G to plant your claim flag'}.`, 7), 600);
        setTimeout(() => this.hud.toast(cmd ? 'Tap a person to talk. Camp shows your people. 3rd person switches the view.' : isTouch ? 'Walk up to someone and tap Use to talk. Top view shows your group from above.' : 'Walk up to someone and press E to talk. J shows your camp. V for the top view.', 6), 8000);
        setTimeout(() => this.hud.toast(cmd ? 'Tap the ground to move · double-tap to run · drag to look around' : isTouch ? 'Left side: move · Right side: look · Buttons: hit, use, jump' : 'WASD move · Mouse look · Click to swing · E to use · Esc for help', 6), 3800);
      });
    }
  }
  // Put the survivor into the world: body and colours, trait effects, and
  // (for a new game) starting kit and spawn point.
  applyProfile(p, fresh) {
    this.profile = p;
    this.mods = traitMods(p.traits || []);
    const pl = this.player;
    const old = pl.char;
    const ch = new Character(p.model === 'woman' ? 'woman' : 'man', profilePalette(p));
    this.scene.remove(old.root);
    this.scene.add(ch.root);
    pl.char = ch;
    pl.maxHealth = this.mods.maxHealth;
    pl.maxStamina = this.mods.maxStamina;
    pl.health = Math.min(pl.health, pl.maxHealth);
    pl.stamina = Math.min(pl.stamina, pl.maxStamina);
    this.setWeapon(pl.weapon && pl.weapon.kind === 'gun' ? 'pistol' : 'bat');
    if (fresh) {
      Object.assign(this.inventory.res, START_RES);
      if (p.traits.includes('prepper')) this.inventory.add({ food: 4, meds: 2, wood: 15, metal: 6, stone: 6 });
      const sp = SPAWNS.find((s) => s.id === p.spawn) || SPAWNS[0];
      pl.spawn(sp.at[0], sp.at[1]);
      pl.health = pl.maxHealth; pl.stamina = pl.maxStamina;
      this.tpc.yaw = -Math.PI / 2;
    }
    pl.syncModel(0.016);
  }
  // build mode for the claim you're in, or your nearest one
  openBuild() {
    if (this.buildMode.active) return;
    const p = this.player.pos;
    let c = this.claims.at(p.x, p.z);
    if (!c && this.claims.list.length) c = [...this.claims.list].sort((a, b) => Math.hypot(a.flag[0] - p.x, a.flag[2] - p.z) - Math.hypot(b.flag[0] - p.x, b.flag[2] - p.z))[0];
    if (!c) { this.hud.toast(isTouch ? 'Plant a claim flag first (tap Claim).' : 'Plant a claim flag first (G).', 2.5); return; }
    if (this.command.active) this.command.closeMenu();
    this.buildMode.enter(c);
  }
  setWeapon(k) {
    if (k === 'pistol' && !this.inventory.weapons.pistol) return;
    const w = { ...WEAPONS[k] };
    if (w.kind === 'bat') { w.damage *= this.mods.melee; w.speed *= this.mods.swing; }
    this.player.weapon = w;
  }
  markDirty() { this.dirtyT = 4; }
  save() { return saveGame(this); }
  newGame() { clearSave(); location.reload(); }
  respawn() {
    const p = this.player;
    const c = this.claims.list[0];
    const at = c ? [c.flag[0] + 1.5, c.flag[2] + 1.5, c.flag[1]] : FEATURES.spawn;
    p.spawn(at[0], at[1], at[2]);
    p.char.root.rotation.x = 0;
    this.inventory.res.food = Math.floor(this.inventory.res.food / 2);
    this.inventory.res.ammo = Math.floor(this.inventory.res.ammo / 2);
    // the ones that got you have wandered off
    this.zombies.list = this.zombies.list.filter((z) => { const near = z.pos.distanceTo(p.pos) < 35; if (near) z.dispose(); return !near; });
    this.hud.hideDeath();
    this.hud.toast('You came to, aching. Some supplies are gone.', 3);
  }
  onPlayerDeath() {
    setTimeout(() => this.hud.showDeath('The dead got you this time. Half your food and ammo went with you.'), 1500);
  }
  onKill() { this.zombies.kills++; }

  handleKeys() {
    const inp = this.input, hud = this.hud;
    if (inp.lockLost) { inp.lockLost = false; if (!hud.paused && !this.buildMode.active && !this.modalOpen && !this.player.dead) hud.togglePause(true); }
    if (inp.pressed('Escape')) {
      // one Esc closes one thing
      if (this.buildMode.designer && !this.buildMode.designer.el.hidden) { this.buildMode.designer.close(); inp.pressedSet.delete('Escape'); }
      else if (this.command.active && (!this.command.$('cmd-menu').hidden || this.command.planting)) { this.command.closeMenu(); this.command.setPlantMode(false); inp.pressedSet.delete('Escape'); }
      else if (this.society.ui.talking) { this.society.ui.closeTalk(); inp.pressedSet.delete('Escape'); }
      else if (!this.society.ui.campEl.hidden) { this.society.ui.toggleCamp(false); inp.pressedSet.delete('Escape'); }
      else if (!this.map.el.hidden) { this.map.toggle(false); inp.pressedSet.delete('Escape'); }
      else if (!this.buildMode.active) hud.togglePause();
    }
    if (hud.paused || this.player.dead) return;
    if (inp.pressed('KeyM') && !this.buildMode.active && !this.society.ui.talking && this.society.ui.campEl.hidden) this.map.toggle();
    if (inp.pressed('KeyJ') && !this.buildMode.active && !this.society.ui.talking && this.map.el.hidden) this.society.ui.toggleCamp();
    if (this.modalOpen) return;
    if (inp.pressed('KeyB') && !this.buildMode.active) { this.openBuild(); inp.pressedSet.delete('KeyB'); }
    if (this.buildMode.active) return;
    if (inp.pressed('KeyV')) this.command.toggle();
    if (inp.pressed('KeyG') && this.command.active) this.command.setPlantMode(true);
    else if (inp.pressed('KeyG')) {
      const f = this.tpc.forward;
      this.claims.plant(this.player.pos.x + f.x * 2, this.player.pos.z + f.z * 2, false, this.player.pos.y);
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
      const hm = Math.round(45 * this.mods.heal), hf = Math.round(15 * this.mods.heal);
      if (inv.res.meds > 0 && p.health < p.maxHealth * 0.6) { inv.res.meds--; p.heal(hm); hud.toast(`Patched up (+${hm} health)`, 2); }
      else if (inv.res.food > 0) { inv.res.food--; p.heal(hf); p.stamina = p.maxStamina; hud.toast(`Ate something (+${hf} health)`, 2); }
      else if (inv.res.meds > 0) { inv.res.meds--; p.heal(hm); hud.toast(`Patched up (+${hm} health)`, 2); }
      else hud.toast('No food or meds.', 1.5);
    }
    if (inp.pressed('KeyI')) {
      const r = this.inventory.res;
      const it = Object.entries(this.inventory.items).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${{ seeds: 'seed stock', sedatives: 'sedatives', liquor: 'whiskey' }[k] || k}`);
      hud.toast(`Pack: ${r.wood} wood, ${r.metal} metal, ${r.stone} stone, ${r.food} food, ${r.meds} meds, ${r.ammo} ammo, ${r.fuel} fuel · ${this.inventory.claimKits} claim kit(s)${it.length ? ' · ' + it.join(', ') : ''}`, 4);
    }
  }

  update(dt) {
    const inp = this.input;
    if (this.setupOpen) {
      // behind the creation screens: a slow look over Harlan's Landing
      this.setupT = (this.setupT || 0) + dt;
      const a = -0.6 + Math.sin(this.setupT * 0.05) * 0.25;
      this.camera.position.set(110 + Math.cos(a) * 95, 42, Math.sin(a) * 95);
      this.camera.lookAt(120, 12, 0);
      this.sky.update(dt * 0.2, this.camera.position);
      this.world.update(dt, this.camera.position);
      return;
    }
    if (inp && this.hud) {
      this.handleKeys();
      if (this.hud.paused) return;
    }
    if (inp && !this.freeCam) {
      if (this.buildMode.active) {
        this.buildMode.update(dt);
        this.player.char.animate(dt, { speed: 0, mode: 'idle', weapon: this.player.weapon.kind === 'gun' ? 'gun' : 'bat' });
        this.player.syncModel(dt);
        this.player.char.mesh.visible = true;
      } else if (this.society.ui.talking) {
        // a two-shot from the side, a little behind your shoulder
        const n = this.society.ui.talking, p = this.player.pos;
        const dx = n.pos.x - p.x, dz = n.pos.z - p.z, L = Math.hypot(dx, dz) || 1;
        const ux = dx / L, uz = dz / L;
        const mx = (p.x + n.pos.x) / 2, mz = (p.z + n.pos.z) / 2, my = Math.max(p.y, n.visualY) + (n.seated ? 1.25 : 1.5);
        const far = 1.9 + L * 0.55;
        const room = (k) => this.physics.raycast(mx, my, mz, -uz * k, 0, ux * k, far + 0.4, { skipGlass: true, filter: (b) => b.kind !== 'tree' }).dist;
        if (!this.talkSide) this.talkSide = room(1) >= room(-1) ? 1 : -1;
        const k = this.talkSide, r = Math.min(far, room(k) - 0.3);
        const cam = new THREE.Vector3(mx - uz * k * r - ux * 0.9, my + 0.3, mz + ux * k * r - uz * 0.9);
        if (!this.talkCamInit) { this.talkCamInit = true; this.camera.position.copy(cam); }
        this.camera.position.lerp(cam, Math.min(1, dt * 4));
        this.camera.lookAt(mx + ux * 0.35, my - 0.12, mz + uz * 0.35);
        // leave room for the talk panel: it sits lower right on wide screens, at the bottom on narrow ones
        if (innerWidth > 720) this.camera.rotateY(isTouch ? -0.34 : -0.2); else this.camera.rotateX(-0.22);
        let f = Math.atan2(dx, dz) - this.player.facing;
        while (f > Math.PI) f -= Math.PI * 2;
        while (f < -Math.PI) f += Math.PI * 2;
        this.player.facing += f * Math.min(1, dt * 5);
        this.player.char.animate(dt, { speed: 0, mode: 'idle', weapon: this.player.weapon.kind === 'gun' ? 'gun' : 'bat' });
        this.player.syncModel(dt);
        this.tpc.yaw = Math.atan2(-ux, -uz);
      } else if (this.command.active && !this.modalOpen) {
        this.talkSide = 0; this.talkCamInit = false;
        this.command.update(dt);
        this.zombies.update(dt);
      } else if (!this.modalOpen) {
        this.talkSide = 0; this.talkCamInit = false;
        const ld = inp.lookDelta();
        const dragging = !inp.locked && (inp.mouse.buttons & 1) && inp.dragMoved;
        if (inp.locked || inp.touch.active || (inp.mouse.buttons & 4) || dragging) this.tpc.look(ld.x, ld.y, inp.touch.active);
        this.player.update(dt, inp, this.tpc);
        // guns fire on the attack input
        if (this.player.weapon.kind === 'gun' && this.player.attackT >= 0 && !this.player._shotFired) { this.combat.shoot(this.player); this.player._shotFired = true; }
        if (this.player.attackT < 0) this.player._shotFired = false;
        this.tpc.update(dt, this.player.char.root.position, this.player.aiming, this.player.crouch);
        // in a tight corner the camera ends up inside the player: hide the model
        const close = this.tpc.curDist < 0.6;
        this.player.char.mesh.visible = !close;
        if (close) this.player.weaponMesh.visible = false;
        this.interaction.update(dt);
        this.zombies.update(dt);
      }
      this.focus = this.player.pos;
      this.command.sync();
      this.society.update(dt);
      this.combat.update(dt);
      this.claims.update(dt);
      this.hud.update(dt);
      // flashlight follows the view
      const fl = this.flashlight;
      fl.intensity = this.player.flashlightOn && !this.buildMode.active ? 40 : 0;
      if (fl.intensity) {
        const f = new THREE.Vector3();
        // from above, the light goes where you face, not where the camera looks
        if (this.command.active && !this.society.ui.talking) f.set(Math.sin(this.player.facing), -0.18, Math.cos(this.player.facing)).normalize();
        else this.camera.getWorldDirection(f);
        fl.position.copy(this.player.pos).add(new THREE.Vector3(0, 1.45, 0)).addScaledVector(f, 0.3);
        fl.target.position.copy(fl.position).addScaledVector(f, 10);
        fl.target.updateMatrixWorld();
      }
      if (this.sky.darkness > 0.75 && !this.player.flashlightOn && !this._flHint) { this._flHint = true; this.hud.toast(isTouch ? 'It is getting dark. Tap Light for your flashlight.' : 'It is getting dark. Press F for your flashlight.', 4); }
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
