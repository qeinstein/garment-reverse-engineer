import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@garment-ir/core': path.resolve(__dirname, '../../packages/garment-ir/src/index.ts'),
      '@garment-ir/validation': path.resolve(__dirname, '../../packages/validation/src/index.ts'),
      '@garment-ir/seamer-adapter': path.resolve(__dirname, '../../packages/seamer-adapter/src/index.ts'),
      '@garment-ir/reweaver-adapter': path.resolve(__dirname, '../../packages/reweaver-adapter/src/index.ts')
    }
  },
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
