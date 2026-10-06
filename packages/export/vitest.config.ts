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
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Chromium-heavy files run one at a time so they do not fight for CPU.
    fileParallelism: false,
  },
});
