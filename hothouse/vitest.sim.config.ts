import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

/** `npm run sim`: the headless economy simulator (bots play for hours of game time). */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  define: { __BUILD_TIME__: JSON.stringify('sim') },
  test: {
    include: ['tests/sim/**/*.balance.test.ts'],
    environment: 'node',
    testTimeout: 600000,
    hookTimeout: 600000,
    pool: 'forks',
  },
});
