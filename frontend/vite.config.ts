import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { defineConfig } from 'vite'

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    // Production build lands directly in `common-service`'s static folder —
    // that gateway serves these files and proxies `/api/*` to the business services.
    build: {
      outDir: '../backend/common-service/public',
      emptyOutDir: true
    },
    server: {
      port: 3000,
      host: '0.0.0.0'
    }
  }
})
