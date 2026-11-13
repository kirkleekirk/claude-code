// Graphics settings. Four steps; everything that differs between them is
// here, and most of it can change while the game is running.
import { isTouch } from '../platform.js';

export const TIERS = {
  // phones and old laptops: no post pipeline, one shadow map, short view
  low: {
    label: 'Low', post: false, msaa: 0, fxaa: false, bloom: 0, ao: false, aoSamples: 0,
    cascades: [{ range: 34, size: 1024 }], cloudShadows: 0.0,
    viewDistance: 400, texSize: 256, grass: 0.4, pixelRatio: 1.25, trees: 105, particles: 0.4,
  },
  medium: {
    label: 'Medium', post: true, msaa: 0, fxaa: true, bloom: 4, ao: false, aoSamples: 0,
    cascades: [{ range: 30, size: 2048 }, { range: 150, size: 1024 }], cloudShadows: 1,
    viewDistance: 620, texSize: 512, grass: 0.7, pixelRatio: 1.5, trees: 150, particles: 0.7,
  },
  high: {
    label: 'High', post: true, msaa: 4, fxaa: false, bloom: 5, ao: true, aoSamples: 8,
    cascades: [{ range: 24, size: 2048 }, { range: 90, size: 2048 }, { range: 340, size: 2048, wide: true }], cloudShadows: 1,
    viewDistance: 900, texSize: 512, grass: 1, pixelRatio: 2, trees: 190, particles: 1,
  },
  ultra: {
    label: 'Ultra', post: true, msaa: 4, fxaa: false, bloom: 6, ao: true, aoSamples: 12,
    cascades: [{ range: 22, size: 4096 }, { range: 85, size: 2048 }, { range: 380, size: 4096, wide: true }], cloudShadows: 1,
    viewDistance: 1500, texSize: 512, grass: 1.5, pixelRatio: 2, trees: 260, particles: 1.4,
  },
};
export const TIER_ORDER = ['low', 'medium', 'high', 'ultra'];

export function detectQuality() {
  let stored = null;
  try { stored = localStorage.getItem('holdfast.quality'); } catch (e) { /* storage blocked */ }
  const q = new URLSearchParams(location.search).get('q') || stored;
  const mobile = isTouch || /Android|iPhone|iPad/i.test(navigator.userAgent);
  const level = TIERS[q] ? q : mobile ? 'low' : 'high';
  return makeQuality(level, mobile);
}
export function makeQuality(level, mobile) {
  const t = TIERS[level];
  return {
    ...t, level, mobile,
    pixelRatio: Math.min(devicePixelRatio || 1, t.pixelRatio),
    // older code reads these
    shadowSize: t.cascades[0].size, shadowRange: t.cascades[0].range, antialias: false,
  };
}
