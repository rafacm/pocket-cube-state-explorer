import { defineConfig } from 'vite';

// The site: the standalone explorer (index.html) and a page showing it embedded (embed-demo.html).
// The web component's own bundle is built by vite.embed.config.ts.
export default defineConfig({
  build: {
    // Three.js alone is ~500 kB minified; the explorer is one chunk on purpose.
    chunkSizeWarningLimit: 800,
    rollupOptions: { input: { main: 'index.html', embedDemo: 'embed-demo.html' } },
  },
});
