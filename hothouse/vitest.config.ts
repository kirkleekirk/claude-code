import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  define: { __BUILD_TIME__: JSON.stringify('test') },
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/sim/**/*.balance.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
