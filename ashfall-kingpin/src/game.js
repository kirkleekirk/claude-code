// Game shell: fixed 60 Hz loop, scenes, overlays, time control, travel, sim<->action bridge,
// saves/autosave, death & capture, minigames, and the automation API for tests.
import { buildWorld } from './world/worldgen.js';
import { validateWorld } from './world/validator.js';
import { PLACE, PLACES, WORLD_W } from './data/places.js';
import { RAMPS, SEM, SEM_CB } from './data/palette.js';
import { WorldRenderer } from './render/world-render.js';
import { bakeMinimap } from './render/terrain.js';
import { pickScale, ctx2d } from './render/canvas.js';
import { isNight, ambientAt } from './render/lighting.js';
import { facilitySprite, plantSprite, strainTint } from './render/facilities.js';
import { randomLook } from './data/looks.js';
import { Input, DEFAULT_BINDS } from './input/input.js';
import { AudioEngine } from './audio/audio.js';
import { UI } from './ui/ui.js';
import { drawHud, hudTick, SPEEDS } from './ui/hud.js';
import { drawLedger } from './ui/ledger.js';
import { drawPanel, drawEventCard, drawPaper, drawDialog, drawDown } from './ui/panels.js';
import { drawTitle, drawPause, drawSettings, drawSaves, drawCredits, drawEnding, drawBoot } from './ui/menus.js';
import { newGame, log, fx, earn, stat } from './sim/state.js';
import { advance } from './sim/sim.js';
import { serialize, saveTo, loadFrom, metaOf } from './sim/save.js';
import { ActionWorld } from './action/world.js';
import { newMinigame, stepMinigame, drawMinigame, consumePick } from './action/minigame.js';
import { HOLLOW_GRID } from './world/layout.js';
import { stageOf } from './sim/grow.js';
import { strainData } from './sim/grow.js';
import { cellUnlocked } from './sim/hollow.js';
import { botHour } from './sim/bot.js';
import { addHeat } from './sim/heat.js';
import { travelSpeed } from './sim/hollow.js';
import { injure } from './sim/crew.js';
import { enterSandbox } from './sim/endgame.js';
import { skipTutorial, tutorialTick } from './sim/tutorial.js';
import { refreshCandidates } from './sim/crew.js';
import { makeNPC, startHunt } from './action/ai.js';

const STEP = 1 / 60;
export { SPEEDS };

const DEFAULT_SETTINGS = {
  master: 0.8, music: 0.55, sfx: 0.8, uiScale: 1, shake: true, reduceFlash: false, colorblind: false, subtitles: true,
  pauseOnBlur: true, muteOnBlur: true, ledgerPause: true, hints: true, showFps: false, binds: { ...DEFAULT_BINDS },
};

function makeStore() {
  try { const k = '__ak_t'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return { get: (x) => localStorage.getItem(x), set: (x, v) => localStorage.setItem(x, v), remove: (x) => localStorage.removeItem(x) }; }
  catch (e) { const m = new Map(); return { get: (x) => (m.has(x) ? m.get(x) : null), set: (x, v) => m.set(x, v), remove: (x) => m.delete(x) }; }
}

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = ctx2d(canvas);
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.ui = new UI(this.input, this.audio);
    this.store = makeStore();
    this.settings = { ...DEFAULT_SETTINGS, ...(JSON.parse(this.store.get('ak.settings') || '{}')) };
    this.settings.binds = { ...DEFAULT_BINDS, ...(this.settings.binds || {}) };
    this.input.binds = this.settings.binds;
    this.applyAudio();
    this.sem = this.settings.colorblind ? SEM_CB : SEM;
    this.ui.sem = this.sem;
    this.scene = 'boot';
    this.S = null;
    this.act = null;
    this.overlay = null;
    this.panel = null;
    this.ledgerTab = 0;
    this.toasts = [];
    this.subs = [];
    this.radio = '';
    this.shakeAmt = 0;
    this.hitstopT = 0;
    this.acc = 0;
    this.last = 0;
    this.time = 0;
    this.fps = 60;
    this.frameMs = 16;
    this.playerLook = randomLook(Math.random, { top: 'rust', top2: 'sand', topStyle: 'jacket', hat: 2, hatC: 'wood', hair: RAMPS.wood[0] });
    this.cam = { x: 0, y: 0 };
    this.bootStep = 0;
    this.W = null;
    window.addEventListener('blur', () => { if (this.settings.muteOnBlur) this.audio.setMuted(true); if (this.settings.pauseOnBlur && this.scene === 'play' && !this.overlay) this.overlay = 'pause'; });
    window.addEventListener('focus', () => { this.audio.setMuted(false); });
    canvas.addEventListener('mousedown', () => this.audio.unlock());
    window.addEventListener('keydown', () => this.audio.unlock());
  }

  start() { requestAnimationFrame((t) => this.frame(t)); }

  // ---------- boot ----------
  bootTick() {
    if (this.bootStep === 0) { this.W = buildWorld(); this.bootStep = 1; return 0.1; }
    if (this.bootStep === 1) {
      const rep = validateWorld(this.W);
      if (rep.errors.length) console.error('Layout validator:', rep.errors.slice(0, 5));
      this.R = new WorldRenderer(this.W);
      this.minimap = bakeMinimap(this.W);
      this.bootStep = 2;
      return 0.2;
    }
    const p = this.R.terrain.bakeSome(14);
    if (p >= 1) { this.scene = 'title'; this.audio.setMood('menu'); }
    return 0.2 + 0.8 * p;
  }

  // ---------- new/load ----------
  newGame(diff, tutorial) {
    const seed = (Date.now() & 0x7fffffff) || 7;
    this.S = newGame(seed, diff, { tutorial });
    this.beginPlay();
    if (!tutorial) { this.S.tutorial.done = true; this.S.tutorial.on = false; skipTutorial(this.S); }
    else fx(this.S, 'dialog', { who: 'mags', title: 'The Hollow', lines: ['Wake up, depot rat. Ten years after the Collapse and you finally own something.', 'Four plots, one bench, one pistol and a plan. Let us see what you make of it.'] });
  }

  beginPlay() {
    const S = this.S;
    this.act = new ActionWorld(this, S);
    this.scene = 'play';
    this.overlay = null;
    this.panel = null;
    this.toasts = [];
    this.audio.setMood('calm');
    this.lastAutosaveDay = S.day;
    S._fx = S._fx || [];
  }

  loadSlot(slot) {
    try {
      const S = loadFrom(this.store, slot);
      if (!S) { this.toast('Empty slot.'); return false; }
      this.S = S;
      this.beginPlay();
      this.toast(`Loaded ${slot === 'auto' ? 'autosave' : 'slot ' + slot.slice(4)} (day ${S.day}).`);
      return true;
    } catch (e) { this.toast('Load failed: ' + e.message, 'bad'); return false; }
  }

  canSave() { return this.S && !this.S.mission && !this.S.defense && this.act && this.act.player.alive && !(this.S.ironman && false); }

  saveSlot(slot) {
    if (!this.S) return false;
    if (!this.canSave()) { this.toast("Can't save during a job or a raid.", 'bad'); return false; }
    if (this.S.ironman && slot !== 'auto') slot = 'slot1';
    try { saveTo(this.store, slot, this.S); this.toast(slot === 'auto' ? 'Autosaved.' : `Saved to slot ${slot.slice(4)}.`, 'good'); return true; }
    catch (e) { this.toast('Save failed: ' + e.message, 'bad'); return false; }
  }

  saveMeta(slot) { return metaOf(this.store, slot); }
  saveSettings() { this.store.set('ak.settings', JSON.stringify(this.settings)); this.input.binds = this.settings.binds; this.applyAudio(); this.sem = this.settings.colorblind ? SEM_CB : SEM; this.ui.sem = this.sem; }
  applyAudio() { this.audio.setVolumes({ master: this.settings.master, music: this.settings.music, sfx: this.settings.sfx }); this.audio.onCue = (t) => { if (this.settings.subtitles) this.subtitle(t); }; }

  // ---------- presentation services ----------
  toast(text, kind = 'info') { this.toasts.push({ text, kind, t: 5 }); if (this.toasts.length > 6) this.toasts.shift(); }
  subtitle(t) { if (this.subs.length && this.subs[this.subs.length - 1].text === t) { this.subs[this.subs.length - 1].t = 2; return; } this.subs.push({ text: t, t: 2 }); if (this.subs.length > 3) this.subs.shift(); }
  shake(n) { if (this.settings.shake) this.shakeAmt = Math.min(6, Math.max(this.shakeAmt, n)); }
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }

  get timeSpeed() { return this.S ? (this.S.speed ?? 1) : 1; }

  // Overlays that freeze both the world and the clock.
  get frozen() { return ['pause', 'settings', 'saves', 'dialog', 'event', 'paper', 'down', 'ending', 'credits', 'confirm'].includes(this.overlay) || !!this.ui.confirmBox; }
  get managing() { return this.overlay === 'ledger' || this.overlay === 'panel'; }

  // ---------- main frame ----------
  frame(t) {
    const now = t / 1000;
    let dt = this.last ? now - this.last : STEP;
    this.last = now;
    dt = Math.min(dt, 0.1);
    this.frameMs = this.frameMs * 0.95 + dt * 1000 * 0.05;
    const W = window.innerWidth, H = window.innerHeight;
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    this.input.pollPad();
    if (this.scene === 'boot') { this.bootProgress = this.bootTick(); }
    else {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= STEP && steps < 6) { this.update(STEP); this.acc -= STEP; steps++; }
      if (steps === 6) this.acc = 0;
    }
    this.render();
    this.input.endFrame();
    requestAnimationFrame((tt) => this.frame(tt));
  }

  update(dt) {
    this.time += dt;
    for (const t of this.toasts) t.t -= dt;
    this.toasts = this.toasts.filter((t) => t.t > 0);
    for (const s of this.subs) s.t -= dt;
    this.subs = this.subs.filter((s) => s.t > 0);
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 18);
    if (this.scene !== 'play' || !this.S) return;
    if (this.hitstopT > 0) { this.hitstopT -= dt; return; }
    this.globalKeys();
    if (this.frozen) { this.consumeFx(); return; }
    const S = this.S;
    const runClock = !(this.managing && this.settings.ledgerPause) && this.timeSpeed > 0 && !(this.mini && this.mini.kind === 'travel');
    if (runClock) {
      const missionSlow = S.mission && S.mission.phase !== 'go' ? 0.25 : 1;
      advance(S, dt * 4 * this.timeSpeed * missionSlow, { onDefense: (s) => this.onDefenseDue(s) });
      if (this.autoBot) botHour(S, { lotOf: (t, k) => this.lotOf(t, k) });
    }
    const worldRuns = !(this.managing && this.settings.ledgerPause);
    if (worldRuns) {
      const aim = this.aimWorld();
      const blocked = this.managing || !!this.mini;
      this.act.update(dt, this.input, aim, blocked);
      this.R.fx.update(dt);
      if (this.mini) this.updateMinigame(dt);
    }
    hudTick(this, dt);
    if (Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) tutorialTick(S);
    this.consumeFx();
    this.updateMood();
  }

  globalKeys() {
    const I = this.input;
    if (this.mini) return;
    if (I.pressed('pause')) {
      if (this.ui.confirmBox) { this.ui.confirmBox = null; return; }
      if (this.overlay === 'settings' || this.overlay === 'saves') { this.overlay = 'pause'; return; }
      if (this.overlay === 'ledger' || this.overlay === 'panel' || this.overlay === 'paper') { this.closeOverlay(); return; }
      if (this.overlay === 'pause') { this.overlay = null; return; }
      if (!this.overlay) { this.overlay = 'pause'; this.audio.play('ui'); return; }
    }
    if (this.frozen) return;
    if (I.pressed('ledger')) { if (this.overlay === 'ledger') this.closeOverlay(); else this.openLedger(); }
    if (I.pressed('map')) this.openLedger(4);
    if (I.pressed('jobs')) this.openLedger(7);
    if (I.pressed('inventory')) this.openLedger(3);
    if (I.pressed('timePause')) { this.S.speed = this.S.speed === 0 ? (this.prevSpeed || 1) : 0; if (this.S.speed === 0) this.prevSpeed = 1; this.toast(this.S.speed === 0 ? 'Time paused (P to resume).' : 'Time running.'); }
    if (I.pressed('faster')) { const i = SPEEDS.indexOf(this.S.speed); this.S.speed = SPEEDS[Math.min(3, i + 1)]; }
    if (I.pressed('slower')) { const i = SPEEDS.indexOf(this.S.speed); this.S.speed = SPEEDS[Math.max(0, i - 1)]; }
    if (I.pressed('overlay')) this.mapOverlay = ((this.mapOverlay || 0) + 1) % 4;
  }

  openLedger(tab) { if (tab !== undefined) this.ledgerTab = tab; this.overlay = 'ledger'; this.panel = null; this.audio.play('tab'); }
  closeOverlay() { this.overlay = null; this.panel = null; this.audio.play('ui_back'); }

  aimWorld() {
    const s = this.zoom || 3;
    if (this.input.pad.active && (this.input.pad.rx || this.input.pad.ry)) {
      const P = this.act.player;
      return { x: P.x + this.input.pad.rx * 80, y: P.y - 7 + this.input.pad.ry * 80 };
    }
    return { x: this.cam.x + this.input.mouse.x / s, y: this.cam.y + this.input.mouse.y / s + 7 };
  }

  updateMood() {
    const S = this.S;
    let mood = 'calm';
    if (S.mission && S.mission.type === 'defense') mood = 'raid';
    else if (this.act.ents.some((e) => e.alive && e.ai && e.ai.state === 'hunt' && !e.civilian && e.faction !== 'crew' && Math.hypot(e.x - this.act.player.x, e.y - this.act.player.y) < 20 * 16)) mood = 'chase';
    else if (S.mission) mood = 'raid';
    else if (this.S.crew.length >= 3 || this.S.rep >= 100) mood = 'hustle';
    this.audio.setMood(mood);
    const night = isNight(S.min) ? 1 : 0;
    const P = this.act.player;
    const nearMachines = Math.max(0, 1 - Math.hypot(P.x - 64 * 16, P.y - 106 * 16) / (24 * 16)) + Math.max(0, 1 - Math.hypot(P.x - 110 * 16, P.y - 38 * 16) / (30 * 16));
    this.audio.setAmbience(night, Math.min(1, nearMachines));
  }

  // ---------- sim fx -> presentation ----------
  consumeFx() {
    const S = this.S;
    if (!S || !S._fx || !S._fx.length) return;
    const list = S._fx.splice(0, S._fx.length);
    for (const f of list) {
      switch (f.type) {
        case 'toast': if (f.kind !== 'event') this.toast(f.text, f.kind); break;
        case 'sale': this.audio.play('kaching'); if (this.act) this.R.fx.coins(this.act.player.x, this.act.player.y - 12, 8); this.R.fx.text(this.act.player.x, this.act.player.y, '+$' + Math.round(f.amount), this.sem.dirty, 30); break;
        case 'level': this.audio.play('levelup'); break;
        case 'rank': this.audio.play('levelup'); this.banner = { text: 'RANK UP: ' + ['Scavenger', 'Hustler', 'Supplier', 'Boss', 'Warlord', 'Kingpin'][f.rank], t: 4 }; break;
        case 'achievement': this.audio.play('achievement'); break;
        case 'heat': this.audio.play('heat'); break;
        case 'heatpop': if (this.act) this.R.fx.text(this.act.player.x, this.act.player.y, `Heat +${f.amount.toFixed(0)}`, this.sem.heat[1], 36); break;
        case 'dialog': this.showDialog({ who: f.who, title: f.title, lines: f.lines, i: 0 }); break;
        case 'event': this.audio.play('card'); if (!this.overlay && !S.mission) this.overlay = 'event'; break;
        case 'dawn': this.onDawn(f); break;
        case 'raidwarn': this.audio.play('siren'); break;
        case 'radio': this.radio = f.text; this.radioT = 0; break;
        case 'sfx': this.audio.play(f.name); break;
        case 'broke': if (!this.magsOffered) { this.magsOffered = true; this.showDialog({ who: 'mags', title: 'Broke?', lines: ['You look broke, sweetheart. Hard to tell under all that ash.', "I'll lend you $200 at 20%. Pay me back within a week. Ledger > Overview has the button, or find me at the Crossroads."], i: 0 }); } break;
        case 'missionDone': this.toast(`${f.ok ? 'JOB COMPLETE' : 'JOB FAILED'}: ${f.title}`, f.ok ? 'good' : 'bad'); break;
        case 'ending': this.onEnding(f.which); break;
        case 'audit': case 'crackdown': this.audio.play('alarm'); break;
        case 'boss': this.audio.play('achievement'); break;
        case 'daybreak': this.audio.play('siren'); break;
        case 'witness': if (this.act) { const P = this.act.player; this.R.fx.text(P.x, P.y, 'Seen!', this.sem.bad, 30); } break;
        default: break;
      }
    }
  }

  showDialog(d) {
    if (this.dialog) { (this.dialogQueue = this.dialogQueue || []).push(d); return; }
    this.dialog = d;
    this.overlay = 'dialog';
  }
  nextDialog() {
    this.dialog = null;
    const q = this.dialogQueue || [];
    if (q.length) { this.dialog = q.shift(); this.overlay = 'dialog'; return; }
    this.overlay = this.S && this.S.events.pending.length && !this.S.mission ? 'event' : null;
  }

  onDawn(f) {
    const S = this.S;
    this.audio.play('bell');
    if (S.day !== this.lastAutosaveDay && this.canSave()) { this.lastAutosaveDay = S.day; if (S.ironman) saveTo(this.store, 'slot1', S); saveTo(this.store, 'auto', S); }
    this.paper = f.paper;
    if (this.settings.hints && S.day <= 4 && !this.overlay && !S.mission) this.overlay = 'paper';
    else this.toast('The Ash Courier is out (Journal).');
  }

  onVisit(p) { if (p.kind === 'settlement' && !this.S.candidates[p.id]) refreshCandidates(this.S); }

  onDefenseDue(S) {
    const P = this.act ? this.act.player : null;
    if (!P || !P.alive || S.mission) return false;
    const home = Math.hypot(P.x - 64 * 16, P.y - 106 * 16) < 26 * 16;
    if (!home) return false;
    return this.act.missions.startDefense();
  }

  onPlayerDown(kind) { this.downKind = kind; this.overlay = 'down'; this.audio.setMood('calm'); }

  // Death: lose 15% carried cash and the loadout used; respawn at the Hollow. Ironman: game over.
  resolveDown(choice) {
    const S = this.S;
    const lossPct = this.act.perk('gun_will') ? 0.07 : 0.15;
    if (S.ironman && this.downKind === 'death') { this.store.remove('ak.slot1'); this.store.remove('ak.auto'); this.scene = 'title'; this.S = null; this.overlay = null; this.toast('Ironman: your story ends here.', 'bad'); return; }
    const lost = Math.round(S.money.carried * lossPct);
    S.money.carried -= lost;
    let msg = `Lost $${lost} of carried cash.`;
    if (this.downKind === 'death') {
      const keep = S.player.loadout.filter(Boolean);
      for (const id of keep) { const i = S.guns.findIndex((g) => g.id === id); if (i >= 0) S.guns.splice(i, 1); }
      S.player.loadout = [null, null, null];
      S.player.carry = {};
      msg += ` The guns you carried are gone (${keep.length}).`;
      advance(S, 360);
    } else {
      S.player.carry = {};
      if (choice === 'bail') { const c = this.bailCost(); if (!this.spendAny(c)) { this.toast('Not enough for bail.', 'bad'); return; } msg += ` Paid $${c} bail.`; advance(S, 180); }
      else if (choice === 'jail') { const ok = Math.random() < 0.55 + this.act.player.maxHp / 1000; msg += ok ? ' You slipped out through the drains.' : ' Caught escaping: two days inside, then they let you go.'; addHeat(S, 'newhaven', ok ? 10 : 4, 'jailbreak'); advance(S, ok ? 240 : 2880); }
      else if (choice === 'crew') { const squad = S.crew.filter((c) => c.status === 'active' && c.job === 'squad' && !c.injured); const ok = squad.length && Math.random() < 0.6 + squad.length * 0.08; msg += ok ? ' Your crew broke you out. The Wardens are furious.' : ' The rescue failed; your crew got hurt and you paid bail anyway.'; if (!ok) { for (const c of squad) injure(S, c, 2); this.spendAny(this.bailCost()); } addHeat(S, 'newhaven', 15, 'jailbreak'); advance(S, 240); }
    }
    stat(S, this.downKind === 'death' ? 'deathsTotal' : 'captures');
    this.act.respawnAtHollow();
    this.act.player.hp = this.act.player.maxHp;
    this.overlay = null;
    this.toast(msg, 'bad');
    log(S, (this.downKind === 'death' ? 'Downed. ' : 'Captured. ') + msg, 'bad');
  }
  bailCost() { const S = this.S; return Math.round(150 + S.notoriety * 18); }
  spendAny(c) { const S = this.S; if (S.money.dirty + S.money.carried >= c) { const fromC = Math.min(S.money.carried, c); S.money.carried -= fromC; S.money.dirty -= c - fromC; return true; } return false; }

  onEnding(which) { this.endingWhich = which; this.overlay = 'ending'; this.audio.play('achievement'); }
  toSandbox() { enterSandbox(this.S); this.overlay = 'credits'; }

  // ---------- travel ----------
  travelTo(placeId) {
    const S = this.S;
    const p = PLACE[placeId];
    const L = this.W.layouts[placeId];
    const P = this.act.player;
    if (S.defense && S.defense.day === S.day) { this.toast('A raid on the Hollow is coming tonight. Travel anyway via the map if you dare.'); }
    const g = L.gate || L.spawns.entrance;
    const out = this.outsideGate(placeId);
    const tiles = Math.hypot(out.x / 16 - P.x / 16, out.y / 16 - P.y / 16);
    const minutes = Math.round(tiles * 2.4 / travelSpeed(S));
    if (P.vehicle) this.act.toggleVehicle(true);
    advance(S, minutes, { onDefense: () => false });
    P.x = out.x; P.y = out.y;
    for (const [id] of this.act.spawned) this.act.despawn(id);
    this.act.townAlert = {};
    if (S.vehicles.active) { const v = this.act.vehicles[0]; if (v) { v.x = out.x + 18; v.y = out.y; } }
    this.toast(`Travelled to ${p.name} (${Math.floor(minutes / 60)}h ${minutes % 60}m).`);
    stat(S, 'trips');
    if ((S.notoriety >= 45 || Object.values(S.rivals).some((r) => r.alive && r.stance === 'war')) && Math.random() < 0.22 && !p.noViolence) this.roadAmbush();
    void g;
    this.closeOverlay();
  }

  outsideGate(placeId) {
    const L = this.W.layouts[placeId];
    const p = PLACE[placeId];
    const g = L.gate || L.spawns.entrance;
    const box = L.box;
    let x = g.x, y = g.y;
    if (y <= box.y) y = box.y - 2; else if (y >= box.y + box.h - 1) y = box.y + box.h + 1;
    else if (x <= box.x) x = box.x - 2; else if (x >= box.x + box.w - 1) x = box.x + box.w + 1;
    if (p.kind === 'ruin') { x = g.x; y = g.y; }
    return { x: x * 16 + 8, y: y * 16 + 10 };
  }

  roadAmbush() {
    const P = this.act.player;
    const S = this.S;
    const war = Object.values(S.rivals).find((r) => r.alive && r.stance === 'war');
    const n = 2 + Math.floor(S.notoriety / 30);
    for (let i = 0; i < n; i++) {
      const e = makeNPC(this.act, war ? (war.id === 'rustjaw' ? 'raider' : war.id === 'palehand' ? 'smuggler' : 'zealot') : 'bounty', P.x + 10 * 16 + i * 12, P.y - 4 * 16 + i * 10, { faction: war ? war.id : 'bounty', hostile: true });
      if (this.act.add(e)) startHunt(this.act, e, P);
    }
    this.toast(war ? `${war.name} ambush on the road!` : 'Bounty hunters were waiting for you!', 'bad');
  }

  lotOf(town, k) { const lots = this.W.buildings.filter((b) => b.place === town && b.lot); return lots[k] ? lots[k].id : 9999; }

  // ---------- interactions / panels ----------
  openInteraction(f) { this.panel = { ...f, tab: 0, sel: 0, n: 1 }; this.overlay = 'panel'; this.audio.play('ui'); if (f.kind === 'hqdoor') { this.toast('Locked tight at night. Pick it, blow it, or pay an inside man.'); this.overlay = null; } }

  startMinigame(kind, data) { this.mini = newMinigame(this.S, kind, data); this.audio.play('tick'); }

  updateMinigame(dt) {
    const I = this.input;
    if (I.pressed('pause')) { this.mini = null; return; }
    const pressed = I.pressed('interact') || I.keyPressed('Space') || (I.mouse.pressed[0] && !this.ui.overUI);
    const r = stepMinigame(this.mini, dt, pressed);
    if (r === 'pin') this.audio.play('lock_ok');
    if (r === 'miss') { this.audio.play('lock_fail'); this.act.combat.noise(this.act.player.x, this.act.player.y, 5 * 16, this.act.player); if (this.mini.picks) consumePick(this.S); this.act.crime('lockpick', this.act.player.x, this.act.player.y); }
    if (r === 'ok') { this.audio.play('lock_ok'); this.finishMinigame(true); }
    if (r === 'fail') { this.audio.play('lock_fail'); this.finishMinigame(false); }
  }

  finishMinigame(ok) {
    const G = this.mini;
    this.mini = null;
    const A = this.act;
    if (!ok) { this.toast(G.kind === 'safe' ? 'The tumblers seized. Blow it with a pipe bomb, or come back later.' : 'The pick snapped.', 'bad'); A.combat.noise(A.player.x, A.player.y, 8 * 16, A.player); return; }
    const d = G.data;
    if (d.door) { A.opened['door:' + (d.door.y * WORLD_W + d.door.x)] = this.S.day; A.locks.delete(d.door.y * WORLD_W + d.door.x); this.audio.play('door'); this.toast('Unlocked.'); }
    if (d.vault) A.missions.lootVault(d.vault, false);
    if (d.container) A.lootContainer(d.container);
    if (d.objective) A.missions.openSafe(d.objective, false);
    if (d.prisoner) A.missions.freePrisoner(d.prisoner);
  }

  // ---------- render ----------
  render() {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = RAMPS.ink[0];
    ctx.fillRect(0, 0, W, H);
    const zoom = pickScale(W, H);
    this.zoom = zoom;
    const uiBase = Math.max(1, Math.floor(Math.min(W / 640, H / 360)) || 1);
    const uiMax = Math.max(1, Math.floor(Math.min(W / 480, H / 270)));
    const us = Math.max(1, Math.min(uiMax, Math.round(uiBase * this.settings.uiScale)));
    const uw = Math.floor(W / us), uh = Math.floor(H / us);
    if (this.scene === 'play' && this.S) this.renderWorld(ctx, W, H, zoom);
    else if (this.scene === 'title' && this.R) this.renderTitleBackdrop(ctx, W, H, zoom);
    this.ui.begin(ctx, uw, uh, us);
    if (this.scene === 'boot') drawBoot(this, this.bootProgress || 0);
    else if (this.scene === 'title') drawTitle(this);
    else if (this.scene === 'play') this.renderPlayUI();
    this.ui.end();
    const showCross = this.scene === 'play' && !this.overlay && !this.mini && !this.ui.overUI && this.ui.cursor === 'arrow';
    this.ui.drawCursor(showCross ? 'cross' : this.ui.cursor);
    if (this.settings.showFps) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.font = '12px monospace'; ctx.fillText(`${(1000 / this.frameMs).toFixed(0)} fps`, W - 70, H - 8); }
  }

  renderPlayUI() {
    const o = this.overlay;
    drawHud(this);
    if (this.mini) drawMinigame(this.ui, this.mini);
    if (o === 'ledger') drawLedger(this);
    else if (o === 'panel') drawPanel(this);
    else if (o === 'event') drawEventCard(this);
    else if (o === 'paper') drawPaper(this);
    else if (o === 'dialog') drawDialog(this);
    else if (o === 'down') drawDown(this);
    else if (o === 'pause') drawPause(this);
    else if (o === 'settings') drawSettings(this);
    else if (o === 'saves') drawSaves(this);
    else if (o === 'ending') drawEnding(this);
    else if (o === 'credits') drawCredits(this);
  }

  renderWorld(ctx, W, H, zoom) {
    const S = this.S, A = this.act;
    const vw = Math.ceil(W / zoom), vh = Math.ceil(H / zoom);
    const P = A.player;
    const aim = this.aimWorld();
    let tx = P.x - vw / 2 + (aim.x - P.x) * 0.12, ty = P.y - 8 - vh / 2 + (aim.y - P.y) * 0.12;
    tx = Math.max(-32, Math.min(128 * 16 - vw + 32, tx)); ty = Math.max(-32, Math.min(128 * 16 - vh + 32, ty));
    this.cam.x += (tx - this.cam.x) * 0.2; this.cam.y += (ty - this.cam.y) * 0.2;
    if (Math.abs(this.cam.x - tx) > 300) { this.cam.x = tx; this.cam.y = ty; }
    let sx = 0, sy = 0;
    if (this.shakeAmt > 0) { sx = (Math.random() - 0.5) * this.shakeAmt; sy = (Math.random() - 0.5) * this.shakeAmt; }
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const camX = Math.round(this.cam.x + sx), camY = Math.round(this.cam.y + sy);
    const ents = A.drawables().concat(this.facilityDrawables());
    this.R.draw(ctx, camX, camY, vw, vh, {
      minute: S.min, focus: P, entities: ents, dt: STEP, timeSec: this.time,
      underlay: (c, cx, cy) => A.combat.drawZonesUnder(c, cx, cy),
      overlay: (c, cx, cy) => { A.combat.draw(c, cx, cy); A.combat.drawSmoke(c, cx, cy); },
      lights: (L) => A.lights(L),
    });
    // Occluded player silhouette when behind a roof.
    if (P.alive && !P.vehicle) {
      const bi = this.W.bldg[Math.floor((P.y - 12) / 16) * WORLD_W + Math.floor(P.x / 16)];
      if (bi >= 0 && this.W.bldg[Math.floor(P.y / 16) * WORLD_W + Math.floor(P.x / 16)] !== bi) { ctx.globalAlpha = 0.45; A.drawEntity(ctx, P, camX, camY); ctx.globalAlpha = 1; }
    }
  }

  facilityDrawables() {
    const S = this.S;
    const L = this.W.layouts.hollow;
    const P = this.act.player;
    if (Math.abs(P.x - 64 * 16) > 40 * 16 || Math.abs(P.y - 106 * 16) > 30 * 16) return [];
    const out = [];
    for (const c of L.gridCells) {
      const i = c.j * 6 + c.i;
      const cell = S.hollow.cells[i];
      const x = c.x * 16, y = c.y * 16;
      if (!cell) {
        if (!cellUnlocked(S, i)) continue;
        out.push({ sy: y, draw: (ctx, cx, cy) => { ctx.strokeStyle = 'rgba(244,234,214,0.18)'; ctx.setLineDash([2, 2]); ctx.strokeRect(Math.round(x - cx) + 1.5, Math.round(y - cy) + 1.5, 29, 29); ctx.setLineDash([]); } });
        continue;
      }
      const spr = facilitySprite(cell.fac);
      out.push({ sy: y + 30, draw: (ctx, cx, cy) => {
        ctx.drawImage(spr, Math.round(x - cx) - 1, Math.round(y - cy) - 9);
        if (cell.plant) {
          const st = strainData(S, cell.plant.strain);
          const stg = stageOf(cell.plant, st);
          ctx.drawImage(plantSprite(strainTint(S, cell.plant.strain), stg, cell.plant.blight), Math.round(x - cx) + 1, Math.round(y - cy) - 2);
          if (cell.plant.water < 25 && !cell.plant.dead) { ctx.fillStyle = this.sem.bad; ctx.fillRect(Math.round(x - cx) + 26, Math.round(y - cy) - 4, 3, 5); }
          if (stg === 4) { const b = Math.round(Math.sin(this.time * 5) * 2); ctx.fillStyle = RAMPS.gold[3]; ctx.fillRect(Math.round(x - cx) + 14, Math.round(y - cy) - 14 + b, 3, 4); }
        }
      } });
    }
    return out;
  }

  renderTitleBackdrop(ctx, W, H, zoom) {
    const vw = Math.ceil(W / zoom), vh = Math.ceil(H / zoom);
    const t = this.time * 6;
    ctx.setTransform(zoom, 0, 0, zoom, 0, 0);
    ctx.imageSmoothingEnabled = false;
    const camX = 30 * 16 + (t % (60 * 16)), camY = 84 * 16;
    this.R.draw(ctx, camX, camY, vw, vh, { minute: 1110, focus: null, entities: [], dt: STEP, timeSec: this.time });
    this.time += 0;
  }

  // ---------- automation API (smoke tests) ----------
  debugApi() {
    const g = this;
    return {
      ready: () => g.scene !== 'boot',
      scene: () => g.scene,
      overlay: () => g.overlay,
      newGame: (diff = 'normal', tut = true) => g.newGame(diff, tut),
      state: () => g.S,
      act: () => g.act,
      bot: (on) => { g.autoBot = on; },
      speed: (s) => { if (g.S) g.S.speed = s; },
      fastForward: (sec) => { for (let i = 0; i < sec * 60; i++) g.update(STEP); },
      clickables: () => g.ui.clickables.map((c) => ({ id: c.id, label: c.label, x: (c.x + c.w / 2) * g.ui.s, y: (c.y + c.h / 2) * g.ui.s, disabled: c.disabled })),
      setOverlay: (o) => { g.overlay = o; },
      ledgerTab: (i) => { g.ledgerTab = i; g.overlay = 'ledger'; },
      teleport: (x, y) => { if (g.act) { g.act.player.x = x * 16 + 8; g.act.player.y = y * 16 + 8; } },
      setMinute: (m) => { if (g.S) g.S.min = m; },
      save: (slot) => g.saveSlot(slot),
      load: (slot) => g.loadSlot(slot),
      serialize: () => (g.S ? serialize(g.S) : null),
      title: () => { g.scene = 'title'; g.S = null; g.overlay = null; },
      earn: (n) => earn(g.S, 'dirty', n, 'debug'),
      travel: (id) => g.travelTo(id),
      fps: () => 1000 / g.frameMs,
      worldToScreen: (x, y) => ({ x: (x - g.cam.x) * g.zoom, y: (y - g.cam.y) * g.zoom }),
      press: (code) => { g.input.pressedKeys.add(code); },
    };
  }
}

export { PLACES, HOLLOW_GRID, ambientAt, SEM };
