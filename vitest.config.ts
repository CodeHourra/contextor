import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    globals: false,
    environment: 'node',
    coverage: {
      reporter: ['text', 'lcov'],
      include: ['src/**'],
    },
  },
});
