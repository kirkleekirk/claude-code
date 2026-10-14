import { defineConfig } from 'vite';

// `--mode artifact` leaves three.js out of the bundle so the single-file page can load it
// from a CDN through an import map (see tools/build-artifact.mjs); `--mode download` keeps it in,
// for the page that runs opened straight from disk (tools/build-download.mjs).
// The world workers are classic scripts: a page opened from disk may not start a module worker.
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : mode === 'download' ? 'dist-download' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
    rollupOptions: mode === 'artifact' ? { external: ['three'] } : {},
  },
  worker: { format: 'iife' },
}));
