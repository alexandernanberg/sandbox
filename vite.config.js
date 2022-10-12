/* eslint-disable import/no-extraneous-dependencies */
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1024,
    target: 'esnext',
  },
  resolve: {
    alias: {
      // Resolve symlink ourselves
      '@react-three/fiber': resolve('node_modules', '@react-three', 'fiber'),
      three: resolve('node_modules', 'three'),
      // 'three-stdlib': resolve('../three-stdlib/dist'),
    },
  },
})
