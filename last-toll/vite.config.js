import { defineConfig } from 'vite';

// `--mode artifact` builds a copy with three.js left external so the page can load it
// from a CDN via an import map (see tools/build-artifact.mjs).
export default defineConfig(({ mode }) => ({
  base: './',
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: mode === 'artifact' ? { external: ['three'] } : {},
  },
}));
