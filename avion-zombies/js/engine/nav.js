// Navigation grid + flow field toward the player. Zombies read the field instead of each
// running their own path search, so a full horde costs one Dijkstra pass.
const INF = 65535;
const DIRS = [
  [1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10],
  [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14],
];
export const WALK = 1;
const CLIMB_MAX = 3.4;
const DROP_MAX = 9;
const STEP = 0.55;

export class NavGrid {
  constructor({ minX, minZ, maxX, maxZ, cell = 0.5 }) {
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    const n = this.w * this.h;
    this.floor = new Float32Array(n);
    this.flags = new Uint8Array(n);
    this.zone = new Uint8Array(n);
    this.door = new Int16Array(n).fill(-1);
    this.dist = new Uint16Array(n).fill(INF);
    this.buckets = [];
    for (let i = 0; i < 256; i++) this.buckets.push([]);
    this.cap = 1600; // ~80 m of path
    this.target = { x: 0, z: 0, i: -1 };
  }

  idx(x, z) {
    const ix = Math.floor((x - this.minX) / this.cell);
    const iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }
  cx(i) {
    return this.minX + ((i % this.w) + 0.5) * this.cell;
  }
  cz(i) {
    return this.minZ + (Math.floor(i / this.w) + 0.5) * this.cell;
  }
  walkable(i) {
    return i >= 0 && (this.flags[i] & WALK) !== 0;
  }

  // Rasterise world colliders into the grid.
  build(physics, terrain, zoneAt, agentR = 0.32) {
    const tmp = [];
    for (let iz = 0; iz < this.h; iz++) {
      for (let ix = 0; ix < this.w; ix++) {
        const i = iz * this.w + ix;
        this._rasterCell(i, physics, terrain, agentR, tmp);
        const x = this.cx(i);
        const z = this.cz(i);
        this.zone[i] = zoneAt(x, z);
      }
    }
  }

  _rasterCell(i, physics, terrain, agentR, tmp) {
    const x = this.cx(i);
    const z = this.cz(i);
    let floor = terrain.heightAt(x, z);
    let blocked = !terrain.walkableAt(x, z);
    let door = -1;
    const cands = physics.query(x, z, agentR + 0.6, tmp);
    // walkable tops first (raise floor, lowest first so stacks chain), then blockers
    cands.sort((a, b) => a.maxY - b.maxY);
    for (const c of cands) {
      if (!c.nav || c.door) continue;
      if (c.walkable && c.climbable && physics.pointInside(c, x, z) && c.maxY - floor <= CLIMB_MAX && c.maxY > floor) {
        floor = c.maxY;
      }
    }
    for (const c of cands) {
      if (!c.nav) continue;
      if (c.minY > floor + 1.9) continue; // overhead
      if (c.maxY <= floor + 0.3) continue; // under foot / step
      if (!physics.footprintOverlap(c, x, z, agentR)) continue;
      if (c.door) {
        door = c.door.id;
        continue;
      }
      if (c.walkable && c.climbable && c.maxY - floor <= CLIMB_MAX && !physics.pointInside(c, x, z)) continue; // edge of a climbable box
      blocked = true;
    }
    this.floor[i] = floor;
    this.door[i] = door;
    this.flags[i] = blocked || door >= 0 ? 0 : WALK; // door cells stay closed until opened
    this._doorWalk = this._doorWalk || new Map();
    if (door >= 0) this._doorWalk.set(i, { ok: !blocked, door });
  }

  openDoor(doorId) {
    if (!this._doorWalk) return;
    for (const [i, d] of this._doorWalk) {
      if (d.door === doorId && d.ok) this.flags[i] = WALK;
    }
  }

  resetDoors() {
    if (!this._doorWalk) return;
    for (const [i] of this._doorWalk) this.flags[i] = 0;
  }

  nearestWalkable(i, radius = 8) {
    if (this.walkable(i)) return i;
    if (i < 0) return -1;
    const ix0 = i % this.w;
    const iz0 = Math.floor(i / this.w);
    for (let r = 1; r <= radius; r++) {
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
          const ix = ix0 + dx;
          const iz = iz0 + dz;
          if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) continue;
          const j = iz * this.w + ix;
          if (this.walkable(j)) return j;
        }
      }
    }
    return -1;
  }

  edgeCost(from, to, diag) {
    const dh = this.floor[to] - this.floor[from];
    if (dh > CLIMB_MAX || dh < -DROP_MAX) return -1;
    let c = diag ? 14 : 10;
    if (dh > STEP) c += 30 + dh * 22;
    else if (dh < -1.2) c += 6;
    return Math.round(c); // Dial's buckets need integer costs
  }

  // Dial's algorithm from the target outward. dist[i] = cost for a zombie at i to reach target.
  computeFlow(x, z) {
    let start = this.nearestWalkable(this.idx(x, z), 10);
    this.dist.fill(INF);
    if (start < 0) return false;
    this.target.x = x;
    this.target.z = z;
    this.target.i = start;
    const B = this.buckets.length;
    for (const b of this.buckets) b.length = 0;
    this.dist[start] = 0;
    this.buckets[0].push(start);
    let remaining = 1;
    let cur = 0;
    const w = this.w;
    const h = this.h;
    const dist = this.dist;
    const flags = this.flags;
    while (remaining > 0 && cur <= this.cap) {
      const bucket = this.buckets[cur % B];
      while (bucket.length) {
        const c = bucket.pop();
        remaining--;
        if (dist[c] !== cur) continue;
        const cx = c % w;
        const cz = (c - cx) / w;
        for (let k = 0; k < 8; k++) {
          const d = DIRS[k];
          const nx = cx + d[0];
          const nz = cz + d[1];
          if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
          const n = nz * w + nx;
          if (!(flags[n] & WALK)) continue;
          if (d[2] === 14 && (!(flags[cz * w + nx] & WALK) || !(flags[nz * w + cx] & WALK))) continue;
          const ec = this.edgeCost(n, c, d[2] === 14);
          if (ec < 0) continue;
          const nd = cur + ec;
          if (nd < dist[n] && nd <= this.cap) {
            dist[n] = nd;
            this.buckets[nd % B].push(n);
            remaining++;
          }
        }
      }
      cur++;
    }
    return true;
  }

  // Best next cell from i (following the field). Returns -1 if none.
  nextCell(i) {
    if (i < 0) return -1;
    const w = this.w;
    const cx = i % w;
    const cz = (i - cx) / w;
    let best = -1;
    let bestD = this.dist[i];
    for (let k = 0; k < 8; k++) {
      const d = DIRS[k];
      const nx = cx + d[0];
      const nz = cz + d[1];
      if (nx < 0 || nz < 0 || nx >= w || nz >= this.h) continue;
      const n = nz * w + nx;
      if (!this.walkable(n)) continue;
      if (d[2] === 14 && (!this.walkable(cz * w + nx) || !this.walkable(nz * w + cx))) continue;
      if (this.edgeCost(i, n, d[2] === 14) < 0) continue;
      if (this.dist[n] < bestD) {
        bestD = this.dist[n];
        best = n;
      }
    }
    return best;
  }

  // Grid line-of-walk: straight walkable line with no big height steps.
  clearPath(x0, z0, x1, z1) {
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const steps = Math.ceil(len / (this.cell * 0.7));
    let prev = this.idx(x0, z0);
    if (prev < 0) return false;
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const i = this.idx(x0 + dx * t, z0 + dz * t);
      if (i < 0 || !this.walkable(i)) return false;
      if (Math.abs(this.floor[i] - this.floor[prev]) > STEP) return false;
      prev = i;
    }
    return true;
  }

  floorAt(x, z) {
    const i = this.idx(x, z);
    return i < 0 ? 0 : this.floor[i];
  }
}
