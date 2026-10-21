import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787'
    }
  },
  build: {
    outDir: 'dist',
    // Emit every asset as a same-origin file. Inlined data: URIs would be
    // blocked by the server's strict Content-Security-Policy.
    assetsInlineLimit: 0
  }
})
