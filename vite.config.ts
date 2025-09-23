import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'McpdSDK',
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'js'}`,
      formats: ['cjs', 'es'],
    },
    rollupOptions: {
      // Externalize deps that shouldn't be bundled into your library
      external: ['lru-cache'],
      output: {
        globals: {
          'lru-cache': 'LRUCache',
        },
      },
    },
    sourcemap: true,
    target: 'node18',
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    dts({
      insertTypesEntry: true,
      copyDtsFiles: true,
    }),
  ],
});