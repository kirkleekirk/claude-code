// Recorded music tracks (public/audio/). Kept apart from the synthesized sound in
// Audio.js: a track streams from a media element instead of being built from nodes.
// Browsers only allow sound after the player has clicked or pressed a key, so a track
// asked to play before that waits for the first gesture.

export class Music {
  constructor() {
    this.volume = 0.8;
    this.tracks = {};
    this.current = null;
    this._pending = null;
    this._gesture = () => {
      const t = this._pending && this.tracks[this._pending];
      if (!t) return;
      t.level = 0;
      this._fadeTo(t, 1, 2.5);
      this._start(this._pending);
    };
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, this._gesture, true);
  }

  _track(name) {
    let t = this.tracks[name];
    if (!t) {
      const el = document.createElement('audio');
      el.src = `./audio/${name}.mp3`;
      el.loop = true;
      el.preload = 'auto';
      t = this.tracks[name] = { el, gain: 1, level: 0, target: 0, rate: 1, broken: false };
      el.addEventListener('error', () => { t.broken = true; });
    }
    return t;
  }

  // Fade a looping track in (and anything else out). gain: its level relative to the
  // volume setting.
  play(name, { gain = 0.7, fade = 1.5 } = {}) {
    const t = this._track(name);
    if (t.broken) return;
    for (const k in this.tracks) if (this.tracks[k] !== t) this._fadeTo(this.tracks[k], 0, 2);
    t.gain = gain;
    this.current = name;
    this._fadeTo(t, 1, fade);
    if (t.el.paused) this._start(name);
  }

  _start(name) {
    const t = this.tracks[name];
    if (!t || t.broken || t.target === 0) { this._pending = null; return; }
    const p = t.el.play();
    if (p && p.catch) {
      p.then(() => { if (this._pending === name) this._pending = null; })
        .catch(() => { this._pending = name; });
    }
  }

  stop(name = this.current, fade = 4) {
    const t = name && this.tracks[name];
    if (!t) return;
    if (this.current === name) this.current = null;
    if (this._pending === name) this._pending = null;
    this._fadeTo(t, 0, fade);
  }

  setVolume(v) {
    this.volume = v;
    for (const k in this.tracks) this._apply(this.tracks[k]);
  }

  _apply(t) {
    t.el.volume = Math.max(0, Math.min(1, t.level * t.gain * this.volume));
  }

  // Fades run on a timer rather than animation frames, so a slow frame (or a hidden tab)
  // doesn't stretch them.
  _fadeTo(t, target, seconds) {
    t.target = target;
    t.rate = Math.abs(target - t.level) / Math.max(0.05, seconds);
    if (this._timer) return;
    let last = performance.now();
    this._timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(1, (now - last) / 1000);
      last = now;
      let moving = false;
      for (const k in this.tracks) {
        const tr = this.tracks[k];
        if (tr.level !== tr.target) {
          const d = tr.target - tr.level;
          tr.level = Math.abs(d) <= tr.rate * dt ? tr.target : tr.level + Math.sign(d) * tr.rate * dt;
          moving = true;
        }
        this._apply(tr);
        if (tr.level === 0 && tr.target === 0 && !tr.el.paused) {
          tr.el.pause();
          tr.el.currentTime = 0;
        }
      }
      if (!moving) {
        clearInterval(this._timer);
        this._timer = null;
      }
    }, 40);
  }
}
