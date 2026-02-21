import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7001,
    open: false,
    proxy: {
      '/api': { target: 'http://localhost:7000', changeOrigin: true }
    }
  }
})
