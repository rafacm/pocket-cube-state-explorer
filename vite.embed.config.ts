import { defineConfig } from 'vite';

// The embeddable web component: one ES module with Three.js and the styles inside, at a stable URL
// (dist/embed/pocket-cube-explorer.js), built after the site so it lands in the same dist/ folder.
export default defineConfig({
  build: {
    outDir: 'dist/embed',
    emptyOutDir: false,
    copyPublicDir: false,
    minify: true,
    // library mode keeps whitespace in ES output by default; this bundle is for browsers only
    rolldownOptions: { output: { minify: true } },
    chunkSizeWarningLimit: 800,
    lib: { entry: 'src/element.ts', formats: ['es'], fileName: () => 'pocket-cube-explorer.js' },
  },
});
