import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
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
          if (!id.includes('node_modules')) return
          if (id.includes('three') || id.includes('@react-three')) return 'three'
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('react-dom')) return 'react-dom'
          if (id.includes('react') || id.includes('zustand')) return 'react'
          if (id.includes('axios')) return 'axios'
        },
      },
    },
  },
})
