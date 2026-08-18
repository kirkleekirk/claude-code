/* BUNKER '86 — small helpers: RNG, math, timing. */
(function (BK) {
  'use strict';

  // Deterministic PRNG (mulberry32) so a seed reproduces a world.
  BK.rng = function (seed) {
    let a = seed >>> 0;
    const f = function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    f.int = (n) => Math.floor(f() * n);
    f.range = (lo, hi) => lo + f() * (hi - lo);
    f.irange = (lo, hi) => lo + Math.floor(f() * (hi - lo + 1));
    f.pick = (arr) => arr[Math.floor(f() * arr.length)];
    f.chance = (p) => f() < p;
    f.shuffle = (arr) => {
      for (let i = arr.length - 1; i > 0; i--) { const j = f.int(i + 1); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }
      return arr;
    };
    return f;
  };

  const R = BK.rng((Math.random() * 1e9) | 0);
  BK.rand = R;                       // global, non-deterministic stream
  BK.pick = (a) => a[Math.floor(Math.random() * a.length)];
  BK.chance = (p) => Math.random() < p;
  BK.irange = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));

  BK.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  BK.lerp = (a, b, t) => a + (b - a) * t;
  BK.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  BK.dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

  // Approach a target at `rate` per second without overshooting.
  BK.approach = (v, target, rate, dt) => {
    const d = target - v, step = rate * dt;
    return Math.abs(d) <= step ? target : v + Math.sign(d) * step;
  };

  BK.fmtClock = function (mins) {
    const m = ((mins % 1440) + 1440) % 1440;
    let h = Math.floor(m / 60), mm = Math.floor(m % 60);
    const ap = h < 12 ? 'AM' : 'PM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + String(mm).padStart(2, '0') + ' ' + ap;
  };

  BK.weightedPick = function (list, wKey) {
    let total = 0;
    for (const it of list) total += (wKey ? it[wKey] : it.weight) || 0;
    let r = Math.random() * total;
    for (const it of list) { r -= (wKey ? it[wKey] : it.weight) || 0; if (r <= 0) return it; }
    return list[list.length - 1];
  };

  BK.uid = (function () { let n = 1; return () => n++; })();
})(window.BK = window.BK || {});
