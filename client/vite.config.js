import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  // shared/ lives outside client/, so Vite needs permission to serve it in dev.
  server: {
    port: 5173,
    fs: { allow: [root, path.resolve(root, '..', 'shared')] },
    proxy: {
      '/socket.io': { target: 'http://localhost:3000', ws: true },
      '/api': { target: 'http://localhost:3000' },
      '/health': { target: 'http://localhost:3000' },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1600,
  },
  resolve: {
    alias: { '@shared': path.resolve(root, '..', 'shared') },
  },
});
