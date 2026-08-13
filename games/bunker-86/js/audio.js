/* BUNKER '86 — procedural audio: synth score, room tone, and the bad noises. */
(function (BK) {
  'use strict';

  const A = BK.Audio = {
    ctx: null, master: null, musicGain: null, sfxGain: null, droneGain: null,
    ready: false, muted: false, musicOn: true,
    _noise: null, _step: 0, _nextNote: 0, _bar: 0
  };

  A.init = function () {
    if (A.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    A.ctx = new AC();
    A.master = A.ctx.createGain(); A.master.gain.value = 0.8; A.master.connect(A.ctx.destination);
    A.musicGain = A.ctx.createGain(); A.musicGain.gain.value = 0.30; A.musicGain.connect(A.master);
    A.sfxGain = A.ctx.createGain(); A.sfxGain.gain.value = 0.55; A.sfxGain.connect(A.master);
    A.droneGain = A.ctx.createGain(); A.droneGain.gain.value = 0.0; A.droneGain.connect(A.master);
    A._noise = makeNoiseBuffer(A.ctx, 2);
    startDrone();
    A.ready = true;
  };

  A.resume = function () {
    if (!A.ctx) A.init();
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
  };

  A.setMuted = function (m) {
    A.muted = m;
    if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.8, A.ctx.currentTime, 0.05);
  };

  A.setMusic = function (on) {
    A.musicOn = on;
    if (A.musicGain) A.musicGain.gain.setTargetAtTime(on ? 0.30 : 0, A.ctx.currentTime, 0.2);
  };

  function makeNoiseBuffer(ctx, secs) {
    const len = ctx.sampleRate * secs;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function noiseSource(dur, filterType, freq, q, gainVal, target) {
    const ctx = A.ctx;
    const src = ctx.createBufferSource();
    src.buffer = A._noise; src.loop = true;
    const flt = ctx.createBiquadFilter();
    flt.type = filterType || 'bandpass'; flt.frequency.value = freq || 1000; flt.Q.value = q || 1;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gainVal, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(flt); flt.connect(g); g.connect(target || A.sfxGain);
    src.start(); src.stop(ctx.currentTime + dur + 0.05);
    return { src: src, flt: flt, g: g };
  }

  function tone(freq, dur, type, vol, target, slideTo) {
    if (!A.ctx) return;
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), ctx.currentTime + dur);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(vol || 0.2, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(target || A.sfxGain);
    o.start(); o.stop(ctx.currentTime + dur + 0.02);
  }

  // ------------------------------------------------------------- room tone --
  let droneOscs = [];
  function startDrone() {
    const ctx = A.ctx;
    const freqs = [55, 82.5, 110.3];
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = f;
      g.gain.value = 0.06;
      lfo.frequency.value = 0.07 + Math.random() * 0.12; lg.gain.value = 0.9;
      lfo.connect(lg); lg.connect(o.detune);
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = 220; flt.Q.value = 3;
      o.connect(flt); flt.connect(g); g.connect(A.droneGain);
      o.start(); lfo.start();
      droneOscs.push({ o: o, g: g, flt: flt });
    }
    // constant tape hiss
    const hiss = ctx.createBufferSource();
    hiss.buffer = A._noise; hiss.loop = true;
    const hf = ctx.createBiquadFilter(); hf.type = 'highpass'; hf.frequency.value = 3000;
    const hg = ctx.createGain(); hg.gain.value = 0.012;
    hiss.connect(hf); hf.connect(hg); hg.connect(A.master);
    hiss.start();
  }

  // dread 0..100 raises the drone and opens the filter — you hear it coming.
  A.setDread = function (dread, indoors) {
    if (!A.ctx) return;
    const t = A.ctx.currentTime;
    A.droneGain.gain.setTargetAtTime(0.10 + (dread / 100) * 0.55, t, 1.2);
    for (const d of droneOscs) d.flt.frequency.setTargetAtTime(180 + dread * 6, t, 1.5);
  };

  // ------------------------------------------------------------------ sfx --
  const SFX = {
    click: () => tone(880, 0.05, 'square', 0.10, null, 1400),
    back: () => tone(420, 0.06, 'square', 0.09, null, 260),
    step: () => { noiseSource(0.07, 'bandpass', 420 + Math.random() * 220, 1.4, 0.05); },
    stepMetal: () => { noiseSource(0.09, 'bandpass', 1600 + Math.random() * 700, 3, 0.045); },
    door: () => { noiseSource(0.35, 'lowpass', 700, 1, 0.10); tone(120, 0.3, 'sawtooth', 0.06, null, 70); },
    loot: () => { tone(660, 0.06, 'square', 0.11); setTimeout(() => tone(990, 0.09, 'square', 0.10), 60); },
    build: () => { tone(220, 0.09, 'square', 0.12); setTimeout(() => tone(330, 0.12, 'square', 0.11), 90); },
    deny: () => { tone(160, 0.16, 'sawtooth', 0.12, null, 90); },
    hurt: () => { noiseSource(0.22, 'lowpass', 500, 1, 0.22); tone(180, 0.2, 'sawtooth', 0.12, null, 60); },
    geiger: () => { noiseSource(0.02, 'highpass', 5000, 1, 0.09); },
    heart: () => { tone(48, 0.18, 'sine', 0.35, null, 34); },
    radio: () => { noiseSource(0.6, 'bandpass', 1200, 0.8, 0.10); },
    good: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'square', 0.10), i * 70)); },
    bad: () => { [330, 260, 190].forEach((f, i) => setTimeout(() => tone(f, 0.18, 'sawtooth', 0.12), i * 90)); },
    levelup: () => { [440, 554, 659, 880].forEach((f, i) => setTimeout(() => tone(f, 0.1, 'triangle', 0.11), i * 60)); },
    sleep: () => { tone(220, 0.5, 'sine', 0.07, null, 110); }
  };

  A.sfx = function (name) {
    if (!A.ready || A.muted) return;
    const f = SFX[name];
    if (f) { try { f(); } catch (e) { /* audio is best-effort */ } }
  };

  // A rising sting for the moments that deserve one. Used sparingly.
  A.sting = function (power) {
    if (!A.ready || A.muted) return;
    const ctx = A.ctx, o = ctx.createOscillator(), g = ctx.createGain(), flt = ctx.createBiquadFilter();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(900 * (power || 1), ctx.currentTime + 1.1);
    flt.type = 'lowpass'; flt.frequency.value = 2400;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.28 * (power || 1), ctx.currentTime + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.4);
    o.connect(flt); flt.connect(g); g.connect(A.master);
    o.start(); o.stop(ctx.currentTime + 1.5);
    noiseSource(1.2, 'highpass', 2000, 1, 0.10, A.master);
  };

  // Breathy, unintelligible whisper. Formant-ish noise, no words.
  A.whisper = function (pan) {
    if (!A.ready || A.muted) return;
    const ctx = A.ctx;
    const src = ctx.createBufferSource(); src.buffer = A._noise; src.loop = true;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 620; f1.Q.value = 9;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 12;
    const g = ctx.createGain(); g.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) p.pan.value = pan === undefined ? (Math.random() * 2 - 1) : pan;
    const dur = 1.2 + Math.random() * 1.4;
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    // wobble the amplitude so it reads as syllables
    for (let i = 0; i < 8; i++) {
      g.gain.linearRampToValueAtTime(0.02 + Math.random() * 0.05, t + dur * (i / 8) + 0.05);
      g.gain.linearRampToValueAtTime(0.004, t + dur * ((i + 0.6) / 8));
    }
    g.gain.linearRampToValueAtTime(0, t + dur);
    f1.frequency.setValueAtTime(500 + Math.random() * 300, t);
    f1.frequency.linearRampToValueAtTime(400 + Math.random() * 500, t + dur);
    src.connect(f1); f1.connect(f2); f2.connect(g);
    if (p) { g.connect(p); p.connect(A.master); } else g.connect(A.master);
    src.start(); src.stop(t + dur + 0.1);
  };

  // Distant knocking. Three, always three.
  A.knock = function () {
    if (!A.ready || A.muted) return;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        noiseSource(0.14, 'lowpass', 220, 1.2, 0.20, A.master);
        tone(70, 0.16, 'sine', 0.16, A.master, 45);
      }, i * 420);
    }
  };

  // ---------------------------------------------------------------- music --
  // Minor-key synthwave: bass pulse, arp, gated snare. Degrades as dread rises.
  const SCALE = [0, 3, 5, 7, 10];      // minor pentatonic
  const ROOT = 55;                      // A1
  const PROG = [0, 0, -2, 3];           // bar roots (semitone offsets)

  function midiToHz(n) { return 440 * Math.pow(2, (n - 69) / 12); }

  A.tick = function (nowSec, dread) {
    if (!A.ready || !A.musicOn || A.muted) return;
    const ctx = A.ctx;
    if (A._nextNote === 0) A._nextNote = ctx.currentTime + 0.1;
    const bpm = 96 - (dread / 100) * 14;
    const spb = 60 / bpm / 2;           // eighth notes
    while (A._nextNote < ctx.currentTime + 0.25) {
      const t = A._nextNote;
      const step = A._step % 16;
      const bar = Math.floor(A._step / 16) % PROG.length;
      const rootOff = PROG[bar];

      // bass on every other eighth
      if (step % 2 === 0) {
        const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
        o.type = 'sawtooth';
        o.frequency.value = midiToHz(33 + rootOff);
        f.type = 'lowpass'; f.frequency.setValueAtTime(300 + (step % 4 === 0 ? 500 : 0), t); f.Q.value = 6;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.22, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 1.6);
        o.connect(f); f.connect(g); g.connect(A.musicGain);
        o.start(t); o.stop(t + spb * 2);
      }
      // arp
      if (step % 1 === 0) {
        const deg = SCALE[(step * 3) % SCALE.length];
        const oct = step % 8 < 4 ? 0 : 12;
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square';
        o.frequency.value = midiToHz(57 + rootOff + deg + oct);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.055, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + spb * 0.9);
        o.connect(g); g.connect(A.musicGain);
        o.start(t); o.stop(t + spb);
      }
      // snare on the backbeat
      if (step % 8 === 4) {
        const src = ctx.createBufferSource(); src.buffer = A._noise; src.loop = true;
        const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.16, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
        src.connect(f); f.connect(g); g.connect(A.musicGain);
        src.start(t); src.stop(t + 0.2);
      }
      // kick
      if (step % 4 === 0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
        g.gain.setValueAtTime(0.30, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(A.musicGain);
        o.start(t); o.stop(t + 0.22);
      }

      A._step++;
      A._nextNote += spb;
    }
  };
})(window.BK = window.BK || {});
