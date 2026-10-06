import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      thresholds: { lines: 90 },
    },
    include: ['test/**/*.test.ts'],
  },
});
