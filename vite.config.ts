import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// BASE_PATH lets GitHub Pages serve the game from a repo subpath, e.g. /FreewalkerFarms/
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        gallery: resolve(import.meta.dirname, 'dev/gallery.html'),
      },
    },
  },
  test: {
    include: ['tests/sim/**/*.test.ts'],
    testTimeout: 60_000,
  },
} as any);
