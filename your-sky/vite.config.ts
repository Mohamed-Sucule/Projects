/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative asset paths, so the same build works wherever it is served: the portfolio's
// /your-sky/ on GitHub Pages, a preview server, or a folder on disk.
const base = process.env.BASE_PATH ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  // One script on purpose: React, the 5,044 stars, the astronomy and the time zone map are
  // all needed to draw the first chart, so splitting them would only add round trips.
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 600 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
