// A world worker: generates chunk columns and lights/meshes them, off the main thread.

import { WorldGen } from './gen.js';
import { Mesher } from './mesher.js';

let gen = null;
const mesher = new Mesher();

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      gen = new WorldGen(m.seed);
      return;
    }
    if (m.type === 'gen') {
      const blocks = gen.generateColumn(m.cx, m.cz);
      self.postMessage({ type: 'gen', id: m.id, cx: m.cx, cz: m.cz, blocks }, [blocks.buffer]);
      return;
    }
    if (m.type === 'mesh') {
      const t0 = performance.now();
      const r = mesher.build(m.cols);
      const transfer = [r.light.buffer, r.heights.buffer];
      for (const p of ['opaque', 'cutout']) {
        const g = r[p];
        transfer.push(g.pos.buffer, g.uv.buffer, g.data.buffer, g.index.buffer);
      }
      self.postMessage({ type: 'mesh', id: m.id, cx: m.cx, cz: m.cz, version: m.version, mesh: r, ms: performance.now() - t0 }, transfer);
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.stack || err) });
  }
};
