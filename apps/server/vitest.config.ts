import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      thresholds: { lines: 80 },
    },
    include: ['test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    pool: 'forks',
  },
});
