import { defineConfig } from 'vite';

// Relative base so the build works when uploaded to itch.io (served from a sub-path / iframe).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    outDir: 'dist',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
});
