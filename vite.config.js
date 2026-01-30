import react from '@vitejs/plugin-react'
import {resolve} from 'path'
import {defineConfig} from 'vite'
// import wasm from 'vite-plugin-wasm'

export default defineConfig({
  plugins: [
    // Does not work in prod
    // https://github.com/Menci/vite-plugin-wasm/issues/57
    // wasm(),
    react({babel: {plugins: [['babel-plugin-react-compiler', {}]]}}),
  ],
  build: {
    chunkSizeWarningLimit: 1024,
    target: 'esnext',
  },
  resolve: {
    alias: {
      '~': resolve(import.meta.dirname, 'src'),
      // Resolve symlink ourselves
      // '@react-three/fiber': resolve('node_modules', '@react-three', 'fiber'),
      // three: resolve('node_modules', 'three'),
      // 'three-stdlib': resolve('../three-stdlib/dist'),
    },
  },
  // Required for Jolt multithread builds (SharedArrayBuffer)
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  // Worker config for multithread WASM
  worker: {
    format: 'es',
  },
  optimizeDeps: {
    // Exclude multithread builds from pre-bundling (they use workers)
    exclude: [
      'jolt-physics/wasm-compat-multithread',
      'jolt-physics/debug-wasm-compat-multithread',
    ],
  },
})
