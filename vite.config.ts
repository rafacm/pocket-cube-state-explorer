import { defineConfig } from 'vite';

export default defineConfig({
  // Three.js alone is ~500 kB minified; the explorer is one chunk on purpose.
  build: { chunkSizeWarningLimit: 800 },
});
