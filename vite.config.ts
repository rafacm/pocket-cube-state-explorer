import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const root = import.meta.dirname;

// Two builds into dist/ (bun run build runs both):
// - the site (default): the standalone explorer and the embedding demo, from site/;
// - the embed bundle (--mode embed): <pocket-cube-explorer> as one ES module with Three.js and the
//   styles inside, at a stable URL, dist/embed/pocket-cube-explorer.js.
export default defineConfig(({ mode }) => mode === 'embed'
  ? {
    root,
    publicDir: false,
    build: {
      outDir: resolve(root, 'dist/embed'),
      emptyOutDir: false,
      minify: true,
      // library mode keeps whitespace in ES output by default; this bundle is for browsers only
      rolldownOptions: { output: { minify: true } },
      chunkSizeWarningLimit: 800,
      lib: { entry: resolve(root, 'src/element.ts'), formats: ['es'], fileName: () => 'pocket-cube-explorer.js' },
    },
  }
  : {
    root: resolve(root, 'site'),
    // the pages load /src/... : the code lives next to site/, not inside it
    resolve: { alias: [{ find: /^\/src\//, replacement: resolve(root, 'src') + '/' }] },
    build: {
      outDir: resolve(root, 'dist'),
      emptyOutDir: true,
      // Three.js alone is ~500 kB minified; the explorer is one chunk on purpose.
      chunkSizeWarningLimit: 800,
      rollupOptions: { input: { main: resolve(root, 'site/index.html'), embedDemo: resolve(root, 'site/embed-demo.html') } },
    },
  });
