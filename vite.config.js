// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Allow CORS for development
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Better chunking for mobile performance
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'hls': ['hls.js'],
        },
      },
    },
  },
  // Make sure public folder assets are copied
  publicDir: 'public',
})
