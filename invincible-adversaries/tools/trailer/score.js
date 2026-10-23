// Procedural trailer score, rendered offline. Cue times follow the edit (see timeline.json):
// cold open 0-13, title 13-17, Invincible 17-30.5, Atom Eve 30.5-45.5, Omni-Man 45.5-60,
// montage 60-65, final pose 65-67.5, end card 67.5-73.5. Tempo 120 BPM (beat = 0.5 s).
window.renderScore = async ({ dur = 75, hits = {} } = {}) => {
  const SR = 48000;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let seed = 1234567;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

  // ---------------------------------------------------------------- buses
  const master = ctx.createGain(); master.gain.value = 0.72;
  const glue = ctx.createDynamicsCompressor(); Object.assign(glue, {}); glue.threshold.value = -16; glue.ratio.value = 2.5; glue.attack.value = 0.015; glue.release.value = 0.3; glue.knee.value = 10;
  const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -3; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.08; lim.knee.value = 0;
  master.connect(glue); glue.connect(lim); lim.connect(ctx.destination);
  function makeIR(len, decay, bright = 1) {
    const n = Math.floor(len * SR), b = ctx.createBuffer(2, n, SR);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch); let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR, k = 0.12 + 0.75 * Math.exp(-t * 2.5) * bright;
        lp += (rnd() * 2 - 1 - lp) * k;
        d[i] = lp * Math.exp(-t * decay) * (i < 240 ? i / 240 : 1);
      }
    }
    return b;
  }
  const rev = ctx.createConvolver(); rev.buffer = makeIR(3.6, 1.6); const revOut = ctx.createGain(); revOut.gain.value = 0.55; rev.connect(revOut); revOut.connect(master);
  const hall = ctx.createConvolver(); hall.buffer = makeIR(6.0, 0.9, 0.7); const hallOut = ctx.createGain(); hallOut.gain.value = 0.4; hall.connect(hallOut); hallOut.connect(master);
  // dotted-eighth delay
  const dIn = ctx.createGain(), dl = ctx.createDelay(2), fb = ctx.createGain(), dlp = ctx.createBiquadFilter();
  dl.delayTime.value = 0.375; fb.gain.value = 0.38; dlp.type = 'lowpass'; dlp.frequency.value = 3200;
  dIn.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); const dOut = ctx.createGain(); dOut.gain.value = 0.5; dlp.connect(dOut); dOut.connect(master); dOut.connect(rev);
  const bus = (vol = 1, { r = 0, h = 0, d = 0, pan = 0 } = {}) => {
    const g = ctx.createGain(); g.gain.value = vol;
    let out = g;
    if (pan) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    out.connect(master);
    if (r) { const s = ctx.createGain(); s.gain.value = r; out.connect(s); s.connect(rev); }
    if (h) { const s = ctx.createGain(); s.gain.value = h; out.connect(s); s.connect(hall); }
    if (d) { const s = ctx.createGain(); s.gain.value = d; out.connect(s); s.connect(dIn); }
    return g;
  };
  // stem buses
  const B = {
    drums: bus(0.9, { r: 0.12 }), perc: bus(0.75, { r: 0.35, h: 0.15 }), bass: bus(0.5), sub: bus(0.55),
    pad: bus(0.42, { r: 0.4, h: 0.3 }), arp: bus(0.3, { r: 0.25, d: 0.45 }), bell: bus(0.3, { r: 0.4, h: 0.35, d: 0.35 }),
    brass: bus(0.85, { r: 0.35, h: 0.25 }), fx: bus(0.6, { r: 0.3, h: 0.3 }), str: bus(0.55, { r: 0.35, h: 0.2 }), shk: bus(0.22, { r: 0.1 }),
  };

  // ---------------------------------------------------------------- sources
  const noiseBuf = (() => { const n = SR * 3, b = ctx.createBuffer(1, n, SR), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1; return b; })();
  const shaper = (drive) => { const s = ctx.createWaveShaper(), n = 2048, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x * drive) / Math.tanh(drive); } s.curve = c; s.oversample = '2x'; return s; };
  const noise = (t, len) => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.loopStart = rnd() * 2; s.start(t, rnd() * 2); s.stop(t + len + 0.05); return s; };
  const osc = (type, f, t, len, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(t); o.stop(t + len + 0.05); return o; };
  const env = (g, t, a, peak, d, end = 0.0001, hold = 0) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); if (hold) g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(end, t + a + hold + d); };
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; };

  // ---------------------------------------------------------------- instruments
  function kick(t, v = 1, dest = B.drums) {
    const o = osc('sine', 150, t, 0.6); o.frequency.setValueAtTime(165, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.09);
    const g = gain(); env(g, t, 0.002, v, 0.42); chain(o, shaper(1.6), g, dest);
    const n = noise(t, 0.02), ng = gain(); env(ng, t, 0.001, v * 0.25, 0.015); chain(n, filt('highpass', 2500), ng, dest);
  }
  function snare(t, v = 1, dest = B.drums) {
    const n = noise(t, 0.3), g = gain(); env(g, t, 0.001, v * 0.7, 0.2); chain(n, filt('bandpass', 1900, 0.6), g, dest);
    const n2 = noise(t, 0.3), g2 = gain(); env(g2, t, 0.001, v * 0.35, 0.12); chain(n2, filt('highpass', 5000), g2, dest);
    const o = osc('triangle', 190, t, 0.2); o.frequency.exponentialRampToValueAtTime(150, t + 0.08); const og = gain(); env(og, t, 0.001, v * 0.5, 0.11); chain(o, og, dest);
    const s = gain(0.35); g.connect(s); s.connect(rev);
  }
  function clap(t, v = 1, dest = B.drums) {
    const n = noise(t, 0.4), bp = filt('bandpass', 1300, 1.1), g = gain(0);
    for (const k of [0, 0.011, 0.023]) { g.gain.setValueAtTime(v, t + k); g.gain.exponentialRampToValueAtTime(v * 0.2, t + k + 0.009); }
    g.gain.setValueAtTime(v * 0.8, t + 0.034); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    chain(n, bp, g, dest); const s = gain(0.5); g.connect(s); s.connect(rev);
  }
  function hat(t, v = 0.3, open = false, dest = B.drums) {
    const n = noise(t, open ? 0.4 : 0.08), g = gain(); env(g, t, 0.001, v * 1.7, open ? 0.28 : 0.05);
    chain(n, filt('highpass', 7200), filt('peaking', 10500, 1), g, dest);
  }
  function shaker(t, v = 0.6) {
    const n = noise(t, 0.08), g = gain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    chain(n, filt('highpass', 6500), g, B.shk);
  }
  function tom(t, f = 90, v = 1, dest = B.perc, len = 0.6) {
    const o = osc('sine', f * 1.6, t, len + 0.2); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g = gain(); env(g, t, 0.002, v, len); chain(o, shaper(1.4), g, dest);
    const n = noise(t, 0.15), ng = gain(); env(ng, t, 0.001, v * 0.3, 0.09); chain(n, filt('lowpass', 900), ng, dest);
  }
  const taiko = (t, v = 1) => { tom(t, 62, v * 1.1, B.perc, 1.0); tom(t, 124, v * 0.25, B.perc, 0.3); };
  function crash(t, v = 0.5, len = 2.6) {
    for (const pan of [-0.6, 0.6]) {
      const n = noise(t, len), g = gain(), p = ctx.createStereoPanner(); p.pan.value = pan;
      env(g, t, 0.003, v * 1.35, len); chain(n, filt('highpass', 3800), filt('peaking', 7500, 1.5), g, p, B.drums);
      const s = gain(0.3); g.connect(s); s.connect(hall);
    }
  }
  function sub(t, v = 1, f0 = 58, f1 = 27, len = 2.6) {
    const o = osc('sine', f0, t, len); o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + len * 0.55);
    const g = gain(); env(g, t, 0.004, v, len); chain(o, shaper(1.3), g, B.sub);
  }
  function boom(t, v = 1) {
    sub(t, v, 62, 26, 3.2);
    const n = noise(t, 1.8), g = gain(); env(g, t, 0.003, v * 0.6, 1.6); chain(n, filt('lowpass', 260), g, B.perc);
    const n2 = noise(t, 0.3), g2 = gain(); env(g2, t, 0.001, v * 0.35, 0.18); chain(n2, filt('bandpass', 1800, 0.8), g2, B.perc);
    const s = gain(0.6); g.connect(s); s.connect(hall);
  }
  function braam(t, notes, v = 1, len = 3, bright = 2600) {
    for (const m of notes) {
      const f = mtof(m), lp = filt('lowpass', 160, 2.5), sh = shaper(2.8), g = gain();
      lp.frequency.setValueAtTime(160, t); lp.frequency.exponentialRampToValueAtTime(bright, t + 0.14); lp.frequency.exponentialRampToValueAtTime(380, t + len);
      for (const dt of [-14, 0, 13]) chain(osc('sawtooth', f, t, len, dt), lp);
      chain(osc('square', f / 2, t, len), gain(0.5), lp);
      env(g, t, 0.035, v / notes.length * 1.6, len, 0.0001, 0.2);
      chain(lp, sh, g, B.brass);
    }
  }
  function stab(t, notes, v = 0.8, len = 0.45) {
    for (const m of notes) {
      const f = mtof(m), lp = filt('lowpass', 300, 1.8), g = gain();
      lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3400, t + 0.03); lp.frequency.exponentialRampToValueAtTime(600, t + len);
      for (const dt of [-9, 9]) chain(osc('sawtooth', f, t, len, dt), lp);
      env(g, t, 0.006, v / notes.length * 1.4, len); chain(lp, shaper(1.6), g, B.brass);
    }
  }
  function riser(t0, t1, v = 0.5, f0 = 350, f1 = 7500) {
    const len = t1 - t0, n = noise(t0, len), bp = filt('bandpass', f0, 2.2), g = gain(0);
    bp.frequency.setValueAtTime(f0, t0); bp.frequency.exponentialRampToValueAtTime(f1, t1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t1 - 0.02); g.gain.linearRampToValueAtTime(0, t1 + 0.01);
    chain(n, bp, g, B.fx);
    const o = osc('sawtooth', 110, t0, len), lp = filt('lowpass', 800, 4), og = gain(0);
    o.frequency.setValueAtTime(90, t0); o.frequency.exponentialRampToValueAtTime(900, t1);
    lp.frequency.setValueAtTime(400, t0); lp.frequency.exponentialRampToValueAtTime(5000, t1);
    og.gain.setValueAtTime(0.0001, t0); og.gain.exponentialRampToValueAtTime(v * 0.35, t1 - 0.02); og.gain.linearRampToValueAtTime(0, t1 + 0.01);
    chain(o, lp, og, B.fx);
  }
  function swell(tEnd, len = 1.2, v = 0.5) {
    const t0 = tEnd - len, n = noise(t0, len), hp = filt('highpass', 1200), lp = filt('lowpass', 1500), g = gain(0);
    lp.frequency.setValueAtTime(1500, t0); lp.frequency.exponentialRampToValueAtTime(14000, tEnd);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, tEnd - 0.01); g.gain.linearRampToValueAtTime(0, tEnd + 0.005);
    chain(n, hp, lp, g, B.fx);
  }
  function whoosh(t, len = 0.6, v = 0.4) {
    const n = noise(t, len), bp = filt('bandpass', 500, 1.4), g = gain(), p = ctx.createStereoPanner();
    bp.frequency.setValueAtTime(400, t); bp.frequency.exponentialRampToValueAtTime(3500, t + len * 0.5); bp.frequency.exponentialRampToValueAtTime(700, t + len);
    p.pan.setValueAtTime(-0.8, t); p.pan.linearRampToValueAtTime(0.8, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + len * 0.45); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    chain(n, bp, g, p, B.fx);
  }
  function metal(t, v = 0.4) {
    for (const [f, a, d] of [[812, 1, 1.4], [1217, 0.6, 1.1], [1873, 0.45, 0.8], [2690, 0.3, 0.6]]) { const o = osc('sine', f, t, d), g = gain(); env(g, t, 0.001, v * a * 0.3, d); chain(o, g, B.perc); }
    const n = noise(t, 0.4), g = gain(); env(g, t, 0.001, v * 0.5, 0.3); chain(n, filt('bandpass', 3300, 9), g, B.perc);
  }
  const hit = (t, v = 1, crashV = 0.45) => { kick(t, v); sub(t, v * 0.7, 60, 30, 1.4); crash(t, crashV); };
  function bass(t, m, len, v = 0.8, drive = 2) {
    const f = mtof(m), lp = filt('lowpass', 250, 1.2), g = gain();
    lp.frequency.setValueAtTime(260, t); lp.frequency.exponentialRampToValueAtTime(1100, t + 0.012); lp.frequency.exponentialRampToValueAtTime(320, t + Math.max(0.08, len));
    chain(osc('sawtooth', f, t, len), lp); chain(osc('square', f / 2, t, len), gain(0.6), lp);
    env(g, t, 0.004, v, Math.max(0.06, len)); chain(lp, shaper(drive), g, B.bass);
  }
  function pluck(t, m, v = 0.5) {
    const f = mtof(m), lp = filt('lowpass', 500, 2), g = gain();
    lp.frequency.setValueAtTime(5200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.16);
    chain(osc('sawtooth', f, t, 0.3, -6), lp); chain(osc('square', f, t, 0.3, 7), gain(0.5), lp);
    env(g, t, 0.002, v, 0.22); chain(lp, g, B.arp);
  }
  function bell(t, m, v = 0.5, len = 1.8) {
    const f = mtof(m);
    for (const [k, a] of [[1, 1], [2.005, 0.35], [3.01, 0.16], [4.2, 0.06]]) { const o = osc('sine', f * k, t, len), g = gain(); env(g, t, 0.002, v * a, len / k); chain(o, g, B.bell); }
  }
  function pad(t0, t1, notes, v = 0.5, cutoff = 1200, att = 0.8, rel = 1.4, dest = B.pad) {
    const len = t1 - t0;
    for (const m of notes) {
      const f = mtof(m), lp = filt('lowpass', cutoff, 0.9), g = gain(0);
      for (const dt of [-8, 8]) chain(osc('sawtooth', f, t0, len + rel, dt), lp);
      chain(osc('triangle', f * 2, t0, len + rel), gain(0.25), lp);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v / notes.length, t0 + att); g.gain.setValueAtTime(v / notes.length, Math.max(t0 + att, t1)); g.gain.exponentialRampToValueAtTime(0.0001, t1 + rel);
      chain(lp, g, dest);
    }
  }
  function strings(t0, t1, notes, v = 0.4, trem = 0) {
    const len = t1 - t0;
    for (const m of notes) {
      const f = mtof(m), lp = filt('lowpass', 2400, 0.8), g = gain(0), vca = gain(1);
      for (const dt of [-11, 0, 11]) { const o = osc('sawtooth', f, t0, len + 0.6, dt); const vib = osc('sine', 5.2 + rnd(), t0, len + 0.6), vg = gain(f * 0.004); vib.connect(vg); vg.connect(o.frequency); chain(o, lp); }
      if (trem) { const lfo = osc('square', trem, t0, len + 0.6), lg = gain(0.45); lfo.connect(lg); lg.connect(vca.gain); }
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v / notes.length, t0 + 0.25); g.gain.setValueAtTime(v / notes.length, t1); g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.5);
      chain(lp, vca, g, B.str);
    }
  }
  function drone(t0, t1, notes, v = 0.4) {
    for (const m of notes) {
      const f = mtof(m), lp = filt('lowpass', 300, 3), g = gain(0);
      const lfo = osc('sine', 0.09 + rnd() * 0.05, t0, t1 - t0 + 2), lg = gain(220); lfo.connect(lg); lg.connect(lp.frequency);
      for (const dt of [-6, 6]) chain(osc('sawtooth', f, t0, t1 - t0 + 2, dt), lp);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v / notes.length, t0 + 2.5); g.gain.setValueAtTime(v / notes.length, t1 - 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t1 + 0.12);
      chain(lp, g, B.pad);
    }
  }
  function heartbeat(t, v = 0.7) { tom(t, 48, v, B.perc, 0.35); tom(t + 0.2, 46, v * 0.7, B.perc, 0.35); }
  function choir(t0, t1, notes, v = 0.35) {
    for (const m of notes) {
      const f = mtof(m), g = gain(0), f1 = filt('bandpass', 750, 3), f2 = filt('bandpass', 1150, 4), sum = gain(1);
      for (const dt of [-7, 0, 7]) { const o = osc('sawtooth', f, t0, t1 - t0 + 1.5, dt); o.connect(f1); o.connect(f2); }
      f1.connect(sum); f2.connect(sum);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v / notes.length * 3, t0 + 0.6); g.gain.setValueAtTime(v / notes.length * 3, t1); g.gain.exponentialRampToValueAtTime(0.0001, t1 + 1.4);
      chain(sum, g, B.pad);
    }
  }

  // ---------------------------------------------------------------- harmony
  const CH = {
    Dm: { b: 38, n: [50, 53, 57], arp: [62, 65, 69, 74] }, Bb: { b: 34, n: [46, 50, 53], arp: [58, 62, 65, 70] },
    F: { b: 41, n: [53, 57, 60], arp: [65, 69, 72, 77] }, C: { b: 36, n: [48, 52, 55], arp: [60, 64, 67, 72] },
    Gm: { b: 43, n: [55, 58, 62], arp: [67, 70, 74, 79] }, A: { b: 33, n: [49, 52, 57], arp: [61, 64, 69, 73] },
    D: { b: 38, n: [50, 54, 57], arp: [62, 66, 69, 74] }, Eb: { b: 39, n: [51, 55, 58], arp: [63, 67, 70, 75] },
  };
  const BEAT = 0.5;

  // ================================================================ COLD OPEN (0 - 13)
  drone(0, 12.9, [26, 33, 38], 0.3);
  strings(2.0, 12.9, [50, 57], 0.13);
  boom(0.0, 0.95); braam(0.0, [26, 38, 45], 0.55, 2.2, 900);
  swell(2.0, 1.0, 0.3);
  boom(5.0, 0.85); metal(5.0, 0.25);
  for (const [k, m] of [[0, 74], [0.75, 77], [1.5, 81], [2.25, 86]]) bell(6.5 + k, m, 0.35, 2.2);
  pad(6.5, 9.0, [62, 69, 74], 0.25, 2600, 0.5, 1.0);
  boom(9.0, 1.0); braam(9.0, [26, 38], 0.45, 1.6, 800);
  for (const t of [10.5, 11.25, 11.75, 12.0]) heartbeat(t, 0.55);
  riser(10.5, 12.95, 0.55);
  for (const t of [12.0, 12.333, 12.667]) { taiko(t, 1.0); metal(t, 0.4); kick(t, 0.8); }
  swell(13.0, 0.33, 0.6);

  // ================================================================ TITLE (13 - 17)
  boom(13.0, 1.15); crash(13.0, 0.7, 3.5);
  braam(13.0, [26, 38, 45, 50, 53], 1.25, 3.4, 3000);
  choir(13.0, 16.2, [62, 65, 69], 0.32);
  sub(14.0, 0.5, 50, 30, 1.5); stab(14.0, [50, 53, 57], 0.35, 0.8); metal(14.0, 0.2);
  // build into the drop: snare roll + toms + riser
  // build into the drop, then a short drop-out so the downbeat hits from silence
  for (let i = 0; i < 29; i++) { const t = 15.0 + i * 0.0625; snare(t, 0.15 + 0.75 * (i / 29) ** 2); }
  for (const [k, f] of [[16.375, 110], [16.5, 98], [16.625, 82]]) tom(k, f, 0.9);
  riser(15.0, 16.82, 0.45, 500, 9000);

  // ================================================================ groove helpers
  function grooveA(t0, bars, prog) { // Invincible: driving, bright
    for (let b = 0; b < bars; b++) {
      const bt = t0 + b * 4 * BEAT, c = CH[prog[b % prog.length]];
      const beats = Math.min(4, Math.round((bars - b) * 4));
      for (let k = 0; k < beats; k++) {
        const t = bt + k * BEAT;
        if (k === 0 || k === 2) kick(t, 1);
        if (k === 1 && beats > 2) kick(t + 0.25, 0.7);
        if (k === 1 || k === 3) { snare(t, 0.85); clap(t, 0.35); }
        hat(t + 0.25, 0.22); hat(t, 0.12);
        if (k === 3) hat(t + 0.25, 0.18, true);
        for (let q = 0; q < 4; q++) shaker(t + q * 0.125, q % 2 ? 0.45 : 0.7);
        for (let e = 0; e < 2; e++) bass(t + e * 0.25, c.b + (e === 1 && k % 2 ? 12 : 0), 0.22, 0.75, 2.2);
        for (let s = 0; s < 4; s++) pluck(t + s * 0.125, c.arp[(k * 4 + s) % 4] + (s === 3 ? 12 : 0), 0.32);
      }
      pad(bt, bt + beats * BEAT - 0.05, c.n.map((m) => m + 12), 0.35, 1600, 0.15, 0.6);
    }
  }
  function grooveB(t0, bars, prog) { // Atom Eve: half-time shimmer
    for (let b = 0; b < bars; b++) {
      const bt = t0 + b * 4 * BEAT, c = CH[prog[b % prog.length]];
      const beats = Math.min(4, Math.round((bars - b) * 4));
      for (let k = 0; k < beats; k++) {
        const t = bt + k * BEAT;
        if (k === 0) kick(t, 0.95);
        if (k === 2) { snare(t, 0.7); clap(t, 0.5); }
        if (k === 3) kick(t + 0.25, 0.55);
        for (let s = 0; s < 4; s++) { hat(t + s * 0.125, s % 2 ? 0.08 : 0.13); shaker(t + s * 0.125, s % 2 ? 0.35 : 0.55); }
        bass(t, c.b, 0.45, 0.6, 1.6);
        for (let e = 0; e < 2; e++) bell(t + e * 0.25, c.arp[(k * 2 + e) % 4] + 12, 0.22, 1.2);
      }
      pad(bt, bt + beats * BEAT - 0.05, c.n.map((m) => m + 12), 0.4, 2400, 0.4, 1.2);
    }
  }
  function grooveC(t0, bars, prog) { // Omni-Man: war drums, distorted bass
    for (let b = 0; b < bars; b++) {
      const bt = t0 + b * 4 * BEAT, c = CH[prog[b % prog.length]];
      const beats = Math.min(4, Math.round((bars - b) * 4));
      for (let k = 0; k < beats; k++) {
        const t = bt + k * BEAT;
        kick(t, k === 0 ? 1.0 : k === 2 ? 0.8 : 0.55);
        if (k === 0 || k === 2) taiko(t, 0.6);
        if (k === 1) taiko(t + 0.25, 0.5);
        if (k === 2) { snare(t, 0.9); clap(t, 0.4); }
        if (k === 3) tom(t + 0.25, 82, 0.6);
        hat(t + 0.25, 0.24); hat(t, 0.12);
        const riff = [0, 0, 0, 3, 0, 0, -2, -5];
        for (let e = 0; e < 2; e++) bass(t + e * 0.25, c.b + riff[(k * 2 + e) % 8], 0.2, 0.85, 4.5);
      }
      stab(bt, c.n.map((m) => m + 12), 0.55, 0.6); if (beats > 2) stab(bt + 1.25, c.n.map((m) => m + 12), 0.4, 0.3);
      strings(bt, bt + beats * BEAT - 0.05, [c.n[0] + 12, c.n[0] + 13, c.n[2] + 12], 0.32, 12);
      for (let k = 0; k < beats * 2; k++) shaker(bt + k * 0.25, k % 2 ? 0.5 : 0.8);
    }
  }

  // ================================================================ INVINCIBLE (17 - 30.5)
  hit(17.0, 1.0, 0.65); boom(17.0, 0.9); stab(17.0, [50, 53, 57, 62], 0.6);
  grooveA(17.0, 4.75, ['Dm', 'Bb', 'F', 'C']); // to 26.5
  for (const t of [19.0, 21.0, 22.5, 24.5]) { crash(t, 0.3, 1.6); }
  whoosh(21.0, 0.5, 0.35);
  // Mach Breaker: launch -> suspense -> impact (slow motion)
  hit(26.5, 1.0, 0.5); stab(26.5, [50, 53, 57], 0.5);
  for (let i = 0; i < 8; i++) tom(26.5 + i * 0.1, 140 - i * 9, 0.55 + i * 0.04);
  riser(26.5, 27.35, 0.5, 600, 8000);
  strings(27.35, 28.8, [74, 75], 0.16, 14); heartbeat(27.5, 0.6); heartbeat(28.1, 0.7);
  const mach = hits.mach || 28.85;
  swell(mach, 0.45, 0.55);
  boom(mach, 1.2); crash(mach, 0.7, 3.4); braam(mach, [26, 38, 45, 50], 1.15, 2.2, 2000);
  pad(mach, 30.3, [50, 57, 62], 0.3, 900, 0.05, 0.4);
  riser(29.4, 30.48, 0.45, 800, 9000);

  // ================================================================ ATOM EVE (30.5 - 45.5)
  hit(30.5, 0.9, 0.5); bell(30.5, 86, 0.45, 2.5); bell(30.5, 81, 0.35, 2.5);
  grooveB(30.5, 4.25, ['Dm', 'Bb', 'Gm', 'A']); // to 39.0
  for (const t of [32.5, 34.5, 36.5]) crash(t, 0.22, 1.4);
  // UNBOUND: the block breaks -> D major lift
  riser(39.0, 39.83, 0.5, 400, 9000); swell(39.85, 0.6, 0.4);
  const unb = hits.unbound || 39.85;
  boom(unb, 1.15); crash(unb, 0.7, 3.4); braam(unb, [26, 38, 45, 50, 54], 1.2, 2.6, 3200);
  choir(unb, 40.85, [62, 66, 69, 74], 0.42);
  // beam: double-time intensity
  const beam = hits.beam || 40.95;
  hit(beam, 0.9, 0.55);
  for (let i = 0; ; i++) {
    const t = beam + i * 0.25; if (t >= 43.45) break;
    if (i % 2 === 0) kick(t, 0.85); if (i % 4 === 2) snare(t, 0.7); hat(t + 0.125, 0.14);
    bass(t, 38 + (i % 8 === 6 ? 3 : 0), 0.2, 0.7, 3.5);
  }
  strings(beam, 43.4, [62, 66, 69], 0.3, 16);
  // revive: ethereal
  hit(43.5, 0.7, 0.35);
  pad(43.5, 45.3, [62, 66, 69, 76], 0.45, 3200, 0.2, 0.8);
  choir(43.6, 45.2, [74, 78, 81], 0.3);
  for (const [k, m] of [[0.15, 86], [0.5, 81], [0.85, 78], [1.2, 74]]) bell(43.5 + k, m, 0.35, 2.0);
  riser(44.5, 45.48, 0.5, 300, 8000);

  // ================================================================ OMNI-MAN (45.5 - 60)
  boom(45.5, 1.15); crash(45.5, 0.6, 3); braam(45.5, [26, 38, 45], 1.1, 2.0, 1800);
  const land = hits.land || 45.85; taiko(land, 1.0); sub(land, 0.6, 55, 28, 1.6);
  grooveC(46.5, 4.75, ['Dm', 'Dm', 'Bb', 'A']); // 46.5 - 56.0
  for (const t of [48.0, 50.0, 52.0, 54.0]) crash(t, 0.25, 1.5);
  // A FRACTION OF OUR POWER
  hit(56.0, 1.1, 0.6); braam(56.35, [26, 38, 45, 50, 51], 1.2, 2.4, 2600);
  for (let i = 0; ; i++) {
    const t = 56.0 + i * 0.25; if (t >= 59.0) break;
    kick(t, i % 2 ? 0.6 : 0.95); if (i % 4 === 2) { snare(t, 0.85); taiko(t, 0.6); } hat(t + 0.125, 0.12);
    bass(t, 38 + [0, 0, 1, 0][i % 4], 0.22, 0.85, 5);
  }
  strings(56.0, 59.9, [62, 63, 69], 0.3, 16);
  riser(58.0, 59.97, 0.6, 400, 9500);
  for (let i = 0; i < 16; i++) snare(59.0 + i * 0.0625, 0.2 + 0.7 * (i / 16) ** 2);

  // ================================================================ MONTAGE (60 - 65)
  const words = [[60.0, ['Dm', 62]], [61.0, ['Bb', 58]], [62.0, ['A', 57]]];
  for (const [t, [c]] of words) { boom(t, 0.9); crash(t, 0.55, 1.6); stab(t, CH[c].n.map((m) => m + 12), 0.6, 0.6); }
  for (const t of [63.0, 64.0]) { hit(t, 0.95, 0.45); stab(t, CH[t === 63 ? 'Bb' : 'C'].n.map((m) => m + 12), 0.5, 0.5); }
  for (let i = 0; i < 20; i++) {
    const t = 60.0 + i * 0.25;
    kick(t, i % 2 ? 0.65 : 0.95); if (i % 4 === 2) snare(t, 0.8); hat(t + 0.125, 0.15);
    const c = CH[['Dm', 'Bb', 'A', 'Bb', 'C'][Math.floor(i / 4)]];
    bass(t, c.b, 0.22, 0.8, 3);
    for (let s = 0; s < 2; s++) pluck(t + s * 0.125, c.arp[(i * 2 + s) % 4] + 12, 0.28);
  }
  riser(63.0, 64.98, 0.6, 500, 10000);
  for (let i = 0; i < 16; i++) snare(64.0 + i * 0.0625, 0.25 + 0.7 * (i / 16) ** 2);

  // ================================================================ FINAL POSE (65 - 67.5)
  boom(65.0, 1.25); crash(65.0, 0.75, 4); braam(65.0, [26, 38, 45, 50, 53, 57], 1.35, 2.8, 3400);
  choir(65.0, 67.0, [62, 65, 69, 74], 0.42);
  strings(65.0, 67.2, [74, 77, 81], 0.28);
  // ================================================================ END CARD (67.5 - 73.5)
  swell(67.5, 0.5, 0.35);
  boom(67.5, 0.9); bell(67.5, 74, 0.4, 3.5); bell(67.5, 81, 0.3, 3.5);
  drone(67.6, 72.6, [26, 38, 45], 0.38);
  pad(67.8, 72.0, [62, 65, 69], 0.22, 900, 1.5, 1.6);

  const buf = await ctx.startRendering();
  const n = buf.length, L0 = buf.getChannelData(0), R0 = buf.getChannelData(1);
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L0[i]), Math.abs(R0[i]));
  const pcm = new Int16Array(n * 2);
  for (let i = 0; i < n; i++) { pcm[i * 2] = Math.max(-1, Math.min(1, L0[i])) * 32767; pcm[i * 2 + 1] = Math.max(-1, Math.min(1, R0[i])) * 32767; }
  const bytes = new Uint8Array(pcm.buffer);
  let s = '';
  for (let k = 0; k < bytes.length; k += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
  return { sr: SR, peak, b64: btoa(s) };
};
