import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    include: ['src/__tests__/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@finance-os/domain-kernel': resolve(
        __dirname,
        '../../packages/domain-kernel/src/index.ts',
      ),
      '@finance-os/event-model': resolve(
        __dirname,
        '../../packages/event-model/src/index.ts',
      ),
    },
  },
});
