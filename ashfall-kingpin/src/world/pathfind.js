// A* on the tile grid, 8-way without corner cutting. `passable(x, y)` decides walkability.

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (a[p].f <= a[i].f) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

const N8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

export function astar(W, H, sx, sy, tx, ty, passable, maxNodes = 40000) {
  if (!passable(tx, ty) || !passable(sx, sy)) return null;
  const key = (x, y) => y * W + x;
  const g = new Map();
  const came = new Map();
  const open = new Heap();
  const h = (x, y) => { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.4142 * Math.min(dx, dy); };
  g.set(key(sx, sy), 0);
  open.push({ x: sx, y: sy, f: h(sx, sy) });
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    const ck = key(cur.x, cur.y);
    if (cur.x === tx && cur.y === ty) {
      const path = [[tx, ty]];
      let k = ck;
      while (came.has(k)) { k = came.get(k); path.push([k % W, Math.floor(k / W)]); }
      return path.reverse();
    }
    if (++expanded > maxNodes) return null;
    const gc = g.get(ck);
    if (cur.f - h(cur.x, cur.y) > gc + 1e-6) continue;
    for (const [dx, dy, c] of N8) {
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !passable(nx, ny)) continue;
      if (dx && dy && (!passable(cur.x + dx, cur.y) || !passable(cur.x, cur.y + dy))) continue;
      const nk = key(nx, ny);
      const ng = gc + c;
      if (ng < (g.has(nk) ? g.get(nk) : Infinity)) {
        g.set(nk, ng);
        came.set(nk, ck);
        open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
      }
    }
  }
  return null;
}

// Flood fill reachability (4-way) from a start tile; returns a Uint8Array mask.
export function floodReach(W, H, sx, sy, passable) {
  const seen = new Uint8Array(W * H);
  if (!passable(sx, sy)) return seen;
  const stack = [sy * W + sx];
  seen[sy * W + sx] = 1;
  while (stack.length) {
    const k = stack.pop();
    const x = k % W, y = (k - x) / W;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const nk = ny * W + nx;
      if (!seen[nk] && passable(nx, ny)) { seen[nk] = 1; stack.push(nk); }
    }
  }
  return seen;
}
