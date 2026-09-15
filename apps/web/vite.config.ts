import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ATELIER = [
  '@atelier/core',
  '@atelier/geometry',
  '@atelier/viewport',
  '@atelier/io',
  '@atelier/sim',
  '@atelier/svelte'
];

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    fs: {
      allow: [
        '.',
        path.resolve(__dirname, '../../vendor/atelier'),
        path.resolve(__dirname, '../../vendor/seamer-studio'),
        path.resolve(__dirname, '../../packages')
      ]
    }
  },
  resolve: {
    dedupe: ['three', 'svelte'],
    alias: {
      '@garment-ir/core': path.resolve(__dirname, '../../packages/garment-ir/src/index.ts'),
      '@garment-ir/validation': path.resolve(__dirname, '../../packages/validation/src/index.ts'),
      '@garment-ir/seamer-adapter': path.resolve(__dirname, '../../packages/seamer-adapter/src/index.ts'),
      '@garment-ir/reweaver-adapter': path.resolve(__dirname, '../../packages/reweaver-adapter/src/index.ts'),
      '@seamer/body-model': path.resolve(__dirname, '../../vendor/seamer-studio/vendor/body-model/src/index.js')
    }
  },
  optimizeDeps: {
    exclude: ATELIER,
    include: [
      'three',
      'three/addons/controls/OrbitControls.js',
      'three/addons/controls/TransformControls.js',
      'three/addons/environments/RoomEnvironment.js',
      'three/addons/lines/LineMaterial.js',
      'three/addons/lines/LineSegments2.js',
      'three/addons/lines/LineSegmentsGeometry.js',
      'three/addons/loaders/RGBELoader.js',
      'three/addons/postprocessing/BokehPass.js',
      'three/addons/postprocessing/EffectComposer.js',
      'three/addons/postprocessing/GTAOPass.js',
      'three/addons/postprocessing/OutputPass.js',
      'three/addons/postprocessing/RenderPass.js',
      'three/addons/postprocessing/SMAAPass.js',
      'three/examples/jsm/exporters/GLTFExporter.js',
      'three/examples/jsm/exporters/OBJExporter.js',
      'three/examples/jsm/exporters/STLExporter.js'
    ]
  },
  ssr: {
    noExternal: ['three', ...ATELIER]
  }
});
