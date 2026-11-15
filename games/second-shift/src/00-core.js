'use strict';
/* =====================================================================
   SECOND SHIFT — a hero dispatch game
   00-core: helpers, RNG, storage, event bus, audio
   ===================================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  bounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; },
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SVG_TAGS = new Set(['svg', 'circle', 'line', 'path', 'g', 'rect', 'polygon', 'ellipse']);
/* hyperscript: h('div.card#id', {onclick}, child, child...) */
function h(sel, attrs, ...kids) {
  const m = /^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i.exec(sel) || [];
  const tag = m[1] || 'div';
  const el = SVG_TAGS.has(tag) ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
  (m[2] || '').replace(/([.#])([\w-]+)/g, (_, t, n) => { if (t === '.') el.classList.add(n); else el.id = n; });
  if (attrs != null && attrs !== false && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') v.split(' ').filter(Boolean).forEach(c => el.classList.add(c));
    else el.setAttribute(k, v === true ? '' : v);
  }
  const add = k => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) k.forEach(add);
    else el.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  };
  kids.forEach(add);
  return el;
}
const svgIcon = (html, cls = '') => { const s = document.createElement('span'); s.className = 'ico ' + cls; s.innerHTML = html; return s; };

/* seeded RNG (mulberry32) + global convenience */
function makeRng(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = arr => arr[Math.floor(r() * arr.length)];
  r.chance = p => r() < p;
  r.shuffle = arr => { const o = arr.slice(); for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  return r;
}
const R = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);   // gameplay rng
const hashStr = s => { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };

const fmtMoney = n => '$' + Math.round(n).toLocaleString('en-US');
const fmtClock = m => {   // game minutes since 09:00 -> "9:05 AM"
  const t = 9 * 60 + Math.floor(m); let hh = Math.floor(t / 60), mm = t % 60;
  const ap = hh >= 12 ? 'PM' : 'AM'; hh = hh % 12 || 12;
  return hh + ':' + String(mm).padStart(2, '0') + ' ' + ap;
};
const fmtDur = m => { m = Math.max(0, Math.ceil(m)); return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm'; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plural = (n, a, b) => n === 1 ? a : (b || a + 's');

/* tiny event bus */
const Bus = (() => {
  const m = {};
  return {
    on(e, f) { (m[e] = m[e] || []).push(f); return () => Bus.off(e, f); },
    off(e, f) { m[e] = (m[e] || []).filter(x => x !== f); },
    emit(e, ...a) { (m[e] || []).slice().forEach(f => { try { f(...a); } catch (err) { console.error('[bus]', e, err); } }); },
  };
})();

/* safe storage */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('secondshift.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('secondshift.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('secondshift.' + k); } catch (e) { /* ignore */ } },
};

/* settings */
const Settings = Object.assign({
  music: true, sfx: true, relaxed: false, autopause: false, shake: true, combatSpeed: 1,
}, Store.get('settings', {}));
Settings.save = () => Store.set('settings', { music: Settings.music, sfx: Settings.sfx, relaxed: Settings.relaxed, autopause: Settings.autopause, shake: Settings.shake, combatSpeed: Settings.combatSpeed });
const prefersReducedMotion = () => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

/* =====================================================================
   AUDIO — everything is synthesized with WebAudio (no assets)
   ===================================================================== */
const Snd = (() => {
  let ac = null, master, sfxBus, musBus, noiseBuf;
  let timer = null, curTrack = null, nextT = 0, stepN = 0, barN = 0, trackName = null;

  function ensure() {
    if (ac) return ac;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ac = new AC();
      const comp = ac.createDynamicsCompressor();
      comp.threshold.value = -14; comp.ratio.value = 4;
      master = ac.createGain(); master.gain.value = 0.9;
      master.connect(comp); comp.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = Settings.sfx ? 0.5 : 0; sfxBus.connect(master);
      musBus = ac.createGain(); musBus.gain.value = Settings.music ? 0.2 : 0; musBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1.5, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ac = null; }
    return ac;
  }
  function unlock() {
    const a = ensure(); if (!a) return;
    const go = () => { if (Settings.music && trackName && !timer) startTrack(trackName); };
    if (a.state === 'suspended') a.resume().then(go).catch(() => { }); else go();
  }

  function osc(type, f0, f1, dur, vol, t0, dest, lp) {
    if (!ac) return;
    t0 = t0 == null ? ac.currentTime : t0;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + Math.min(0.012, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let last = o;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); last = f; }
    last.connect(g); g.connect(dest || sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, vol, t0, dest, kind, f0, f1) {
    if (!ac) return;
    t0 = t0 == null ? ac.currentTime : t0;
    const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac.createBiquadFilter(); f.type = kind || 'lowpass'; f.frequency.setValueAtTime(f0 || 2000, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus); s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
  const arp = (notes, type, step, dur, vol, t0) => notes.forEach((n, i) => osc(type, n, n, dur, vol, (t0 || ac.currentTime) + i * step));
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  const S = {
    click() { osc('square', 640, 420, 0.05, 0.1); },
    hover() { osc('sine', 880, 880, 0.03, 0.035); },
    select() { osc('triangle', 520, 780, 0.09, 0.14); },
    back() { osc('triangle', 520, 330, 0.09, 0.12); },
    error() { osc('square', 150, 110, 0.14, 0.12); },
    ring() { const t = ac.currentTime; for (let i = 0; i < 2; i++) { osc('triangle', 880, 880, 0.09, 0.14, t + i * 0.13); osc('triangle', 1175, 1175, 0.09, 0.1, t + i * 0.13); } },
    dispatch() { const t = ac.currentTime; osc('square', 1100, 1700, 0.07, 0.09, t); noise(0.09, 0.12, t, null, 'bandpass', 3000); osc('square', 1500, 1500, 0.05, 0.07, t + 0.11); },
    radio() { const t = ac.currentTime; noise(0.12, 0.1, t, null, 'bandpass', 2500); osc('square', 900, 900, 0.04, 0.05, t + 0.02); },
    ok() { arp([mtof(72), mtof(76), mtof(79)], 'triangle', 0.08, 0.25, 0.2); },
    great() { const t = ac.currentTime; arp([mtof(72), mtof(76), mtof(79), mtof(84)], 'triangle', 0.075, 0.3, 0.22, t); osc('sine', mtof(96), mtof(96), 0.5, 0.08, t + 0.3); },
    meh() { arp([mtof(67), mtof(64)], 'triangle', 0.12, 0.25, 0.18); },
    bad() { const t = ac.currentTime; osc('sawtooth', 330, 110, 0.5, 0.14, t, null, 900); osc('sawtooth', 247, 82, 0.5, 0.1, t + 0.05, null, 700); },
    hit() { const t = ac.currentTime; noise(0.09, 0.28, t, null, 'lowpass', 2600, 300); osc('sine', 170, 55, 0.14, 0.4, t); },
    crit() { const t = ac.currentTime; noise(0.14, 0.35, t, null, 'lowpass', 4000, 300); osc('sine', 200, 45, 0.22, 0.5, t); osc('square', 1400, 900, 0.12, 0.1, t); },
    slam() { const t = ac.currentTime; noise(0.2, 0.4, t, null, 'lowpass', 1800, 120); osc('sine', 110, 35, 0.3, 0.55, t); },
    boom() { const t = ac.currentTime; noise(0.7, 0.55, t, null, 'lowpass', 2400, 90); osc('sine', 90, 28, 0.6, 0.6, t); },
    zap() { const t = ac.currentTime; osc('sawtooth', 1800, 160, 0.2, 0.12, t, null, 5000); noise(0.2, 0.18, t, null, 'highpass', 3000); },
    whoosh() { noise(0.28, 0.2, null, null, 'bandpass', 400, 2400); },
    shoot() { osc('square', 900, 220, 0.12, 0.1); },
    fire() { noise(0.4, 0.22, null, null, 'bandpass', 700, 300); },
    ice() { const t = ac.currentTime; arp([mtof(96), mtof(100), mtof(103), mtof(108)], 'sine', 0.035, 0.2, 0.1, t); },
    heal() { arp([mtof(72), mtof(76), mtof(79), mtof(84)], 'sine', 0.06, 0.3, 0.14); },
    shield() { osc('triangle', 400, 900, 0.25, 0.15); osc('sine', 800, 1800, 0.25, 0.06); },
    hop() { osc('sine', 260, 420, 0.09, 0.14); },
    teleport() { const t = ac.currentTime; osc('sine', 1400, 300, 0.18, 0.14, t); osc('sine', 300, 1400, 0.18, 0.14, t + 0.18); },
    turn() { osc('sine', 660, 660, 0.12, 0.1); osc('sine', 990, 990, 0.18, 0.08, ac.currentTime + 0.07); },
    ult() { const t = ac.currentTime; osc('sawtooth', 120, 1100, 0.6, 0.16, t, null, 3000); noise(0.55, 0.2, t, null, 'highpass', 500, 4000); osc('square', mtof(60), mtof(60), 0.5, 0.06, t + 0.5); },
    ko() { osc('sawtooth', 400, 70, 0.45, 0.14, null, null, 800); },
    levelup() { arp([mtof(67), mtof(71), mtof(74), mtof(79), mtof(83)], 'triangle', 0.07, 0.3, 0.2); },
    coin() { const t = ac.currentTime; osc('square', 988, 988, 0.07, 0.1, t); osc('square', 1319, 1319, 0.2, 0.1, t + 0.07); },
    stamp() { const t = ac.currentTime; osc('sine', 120, 50, 0.2, 0.5, t); noise(0.1, 0.3, t, null, 'lowpass', 1500, 200); },
    victory() { const t = ac.currentTime; arp([mtof(60), mtof(64), mtof(67), mtof(72), mtof(67), mtof(72), mtof(76)], 'triangle', 0.11, 0.3, 0.2, t); },
    defeat() { const t = ac.currentTime; arp([mtof(64), mtof(62), mtof(60), mtof(55)], 'triangle', 0.2, 0.4, 0.18, t); },
  };

  /* --- music: two tiny step-sequenced tracks --- */
  const TRACKS = {
    hub: {
      bpm: 94, swing: 0.1, prog: [
        { r: 38, c: [53, 57, 60, 64] }, { r: 31, c: [53, 59, 62, 67] }, { r: 36, c: [52, 55, 59, 64] }, { r: 33, c: [52, 55, 60, 64] }],
      bassSteps: [0, 3, 6, 8, 11, 14], chordSteps: [2, 5, 10, 13], kick: [0, 7, 10], snare: [4, 12], hat: [2, 6, 10, 14], hatQuiet: [0, 4, 8, 12],
    },
    combat: {
      bpm: 124, swing: 0, prog: [
        { r: 33, c: [57, 60, 64] }, { r: 29, c: [53, 57, 60] }, { r: 36, c: [55, 60, 64] }, { r: 31, c: [55, 59, 62] }],
      bassSteps: [0, 2, 4, 6, 8, 10, 12, 14], chordSteps: [], kick: [0, 4, 8, 12], snare: [4, 12], hat: [2, 6, 10, 14], hatQuiet: [1, 3, 5, 7, 9, 11, 13, 15], arp: true,
    },
  };
  function scheduleStep(tr, st, bar, t, spb) {
    const ch = tr.prog[bar % tr.prog.length];
    const sw = (st % 2 === 1) ? tr.swing * spb : 0; t += sw;
    if (tr.kick.includes(st)) { osc('sine', 140, 42, 0.16, 0.7, t, musBus); }
    if (tr.snare.includes(st)) { noise(0.12, 0.35, t, musBus, 'bandpass', 1800); osc('triangle', 220, 160, 0.08, 0.18, t, musBus); }
    if (tr.hat.includes(st)) noise(0.04, 0.16, t, musBus, 'highpass', 7000);
    else if (tr.hatQuiet.includes(st)) noise(0.03, 0.07, t, musBus, 'highpass', 8000);
    if (tr.bassSteps.includes(st)) {
      const fifth = (st === 6 || st === 11) ? 7 : (st === 3 || st === 14 ? 12 : 0);
      osc('triangle', mtof(ch.r + fifth), mtof(ch.r + fifth), spb * 1.7, 0.42, t, musBus, 900);
    }
    if (tr.chordSteps.includes(st)) ch.c.forEach((n, i) => { osc('triangle', mtof(n), mtof(n), spb * 2.2, 0.085, t + i * 0.006, musBus, 2200); osc('sine', mtof(n + 12), mtof(n + 12), spb * 1.4, 0.03, t + i * 0.006, musBus); });
    if (tr.arp) { const n = ch.c[st % ch.c.length] + (st % 8 < 4 ? 12 : 24); osc('square', mtof(n), mtof(n), spb * 0.9, 0.05 + (st % 4 === 0 ? 0.03 : 0), t, musBus, 2600); }
  }
  function tick() {
    if (!ac || !curTrack) return;
    const tr = TRACKS[curTrack], spb = 60 / tr.bpm / 4;
    if (nextT < ac.currentTime - 0.5) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.25) {
      scheduleStep(tr, stepN, barN, nextT, spb);
      nextT += spb; stepN++; if (stepN >= 16) { stepN = 0; barN++; }
    }
  }
  function startTrack(name) {
    trackName = name;
    if (!ensure() || !Settings.music) return;
    if (ac.state === 'suspended') return;           // wait for a user gesture
    if (curTrack === name && timer) return;
    curTrack = name; stepN = 0; barN = 0; nextT = ac.currentTime + 0.1;
    if (!timer) timer = setInterval(tick, 60);
  }
  function stopTrack() { curTrack = null; if (timer) { clearInterval(timer); timer = null; } }

  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend().catch(() => { }); else ac.resume().catch(() => { }); });

  return {
    unlock, ensure,
    play(name, ...a) { if (!Settings.sfx) return; if (!ensure() || ac.state !== 'running') return; try { S[name] && S[name](...a); } catch (e) { /* audio never breaks the game */ } },
    music(name) { trackName = name; if (!name) { stopTrack(); return; } if (Settings.music) { if (curTrack !== name) { stopTrack(); } startTrack(name); } },
    apply() { if (!ac) return; sfxBus.gain.value = Settings.sfx ? 0.5 : 0; musBus.gain.value = Settings.music ? 0.2 : 0; if (Settings.music && trackName) startTrack(trackName); if (!Settings.music) stopTrack(); },
  };
})();
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => Snd.unlock(), { passive: true }));
const sfx = (n, ...a) => Snd.play(n, ...a);
