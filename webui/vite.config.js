import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createOnewifiDevProxy } from './server/onewifiDevProxy.js'

const root = path.dirname(fileURLToPath(import.meta.url))
const apiTarget = process.env.VITE_API_PROXY || process.env.ONEWIFI_DEV_API || 'https://127.0.0.1:10443'

function apiProxy() {
  return createOnewifiDevProxy(apiTarget)
}

export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': apiProxy(),
    },
  },
  preview: {
    host: true,
    proxy: {
      '/api': apiProxy(),
    },
  },
  build: {
    outDir: path.resolve(root, process.env.VITE_OUT_DIR || 'dist'),
    emptyOutDir: true,
  },
})
