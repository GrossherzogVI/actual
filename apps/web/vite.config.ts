import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@finance-os/design-system': resolve(
        rootDir,
        '../../packages/design-system/src/index.ts',
      ),
      '@finance-os/domain-kernel': resolve(
        rootDir,
        '../../packages/domain-kernel/src/index.ts',
      ),
      '@': resolve(rootDir, './src'),
    },
  },
  server: {
    port: 5176,
    host: true,
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          charts: ['echarts', 'echarts-for-react'],
          query: ['@tanstack/react-query'],
        },
      },
    },
  },
});
