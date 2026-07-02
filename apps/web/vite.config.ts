import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  // @trimatch/shared is a linked CJS workspace package — include it in dev
  // pre-bundling and in rollup's CJS handling for prod builds. force: the
  // pre-bundle cache does not track linked-package rebuilds, which serves
  // stale schemas; re-bundling on every dev start is cheap and correct.
  optimizeDeps: {
    include: ['@trimatch/shared'],
    force: true,
  },
  build: {
    commonjsOptions: {
      include: [/packages\/shared/, /node_modules/],
    },
  },
});
