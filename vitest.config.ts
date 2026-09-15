import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@garment-ir/core': path.resolve(__dirname, 'packages/garment-ir/src/index.ts'),
      '@garment-ir/validation': path.resolve(__dirname, 'packages/validation/src/index.ts'),
      '@garment-ir/seamer-adapter': path.resolve(__dirname, 'packages/seamer-adapter/src/index.ts'),
      '@garment-ir/reweaver-adapter': path.resolve(__dirname, 'packages/reweaver-adapter/src/index.ts'),
      '@atelier/core': path.resolve(__dirname, 'vendor/atelier/packages/core/src/index.ts'),
      '@atelier/geometry': path.resolve(__dirname, 'vendor/atelier/packages/geometry/src/index.ts'),
      '@atelier/io': path.resolve(__dirname, 'vendor/atelier/packages/io/src/index.ts'),
      '@atelier/sim': path.resolve(__dirname, 'vendor/atelier/packages/sim/src/index.ts'),
      '@seamer/pattern-model/utils/assembly': path.resolve(__dirname, 'vendor/seamer-studio/packages/pattern-model/src/utils/assembly.ts'),
      '@seamer/pattern-model/utils/patternGeometry': path.resolve(__dirname, 'vendor/seamer-studio/packages/pattern-model/src/utils/patternGeometry.ts'),
      '@seamer/pattern-model': path.resolve(__dirname, 'vendor/seamer-studio/packages/pattern-model/src/index.ts'),
      '@seamer/cloth-sim': path.resolve(__dirname, 'vendor/seamer-studio/packages/cloth-sim/src/index.ts'),
      '@seamer/avatar': path.resolve(__dirname, 'vendor/seamer-studio/packages/avatar/src/index.ts'),
      '@seamer/body-model': path.resolve(__dirname, 'vendor/seamer-studio/vendor/body-model/src/index.js')
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts', 'tests/**/*.test.ts']
  }
});
