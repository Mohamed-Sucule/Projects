/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths, so the same build works wherever it is served: the portfolio's
// /cells/ on GitHub Pages, a preview server, or a folder on disk.
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: { target: 'es2022', sourcemap: true },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
