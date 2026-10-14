import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const devApi = process.env.ONEWIFI_DEV_API || 'https://localhost:10443'

// The manager serves the built app and proxies /api + /ws on the same origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: './',
  build: {
    outDir: 'dist', emptyOutDir: true,
    rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom'], sip: ['jssip'] } } },
  },
  // For local UI development, proxy API/WS to a running control plane. Defaults to
  // localhost; override with ONEWIFI_DEV_API.
  server: {
    proxy: {
      '/api': { target: devApi, changeOrigin: true, secure: false },
      '/ws': { target: devApi.replace(/^http/, 'ws'), ws: true, secure: false },
    },
  },
})
