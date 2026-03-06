import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const devApiTarget = process.env.VITE_DEV_API_TARGET || 'http://127.0.0.1:6000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7001,
    open: false,
    proxy: {
      '/api': {
        target: devApiTarget,
        changeOrigin: true,
        secure: false,
      }
    }
  }
})
