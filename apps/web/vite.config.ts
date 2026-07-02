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
  // pre-bundling and in rollup's CJS handling for prod builds.
  optimizeDeps: {
    include: ['@trimatch/shared'],
  },
  build: {
    commonjsOptions: {
      include: [/packages\/shared/, /node_modules/],
    },
  },
});
