import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/cloud-render': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cloud-render/, '/cloud'),
      },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('vite/preload-helper')) return 'preload-helper'
          if (!id.includes('node_modules')) return
          if (id.includes('three') || id.includes('@react-three')) return 'three'
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          // ВАЖНО: react и react-dom должны быть в одном чанке.
          // React 19's react-dom пишет в shared internals react'а — если они
          // в разных ESM-чанках, может инициализироваться раньше, чем react
          // создаст эти internals, и упасть с "Cannot set properties of undefined".
          if (id.includes('react-dom') || id.includes('react') || id.includes('zustand')) return 'react'
          if (id.includes('axios')) return 'axios'
        },
      },
    },
  },
})
