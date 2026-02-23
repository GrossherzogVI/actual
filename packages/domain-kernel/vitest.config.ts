import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
