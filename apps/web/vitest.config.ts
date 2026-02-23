import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: __dirname,
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup.ts'],
  },
  resolve: {
    alias: {
      '@finance-os/design-system': resolve(
        __dirname,
        '../../packages/design-system/src/index.ts',
      ),
      '@finance-os/domain-kernel': resolve(
        __dirname,
        '../../packages/domain-kernel/src/index.ts',
      ),
    },
  },
});
