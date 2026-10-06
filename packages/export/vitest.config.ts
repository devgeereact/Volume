import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
    // Chromium-heavy files run one at a time so they do not fight for CPU.
    fileParallelism: false,
  },
});
