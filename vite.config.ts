import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages配信時はワークフローが MASUME_BASE=/masume/ を与える
  base: process.env.MASUME_BASE ?? '/',
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
