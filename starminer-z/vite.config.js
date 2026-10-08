import { defineConfig } from 'vite';

// `--mode artifact` leaves three.js out of the bundle so the single-file page can load it
// from a CDN through an import map (see tools/build-artifact.mjs).
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 100000000,
    rollupOptions: mode === 'artifact' ? { external: ['three'] } : {},
  },
  worker: { format: 'es' },
}));
