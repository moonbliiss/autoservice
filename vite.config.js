import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        workshop: fileURLToPath(new URL('./index.html', import.meta.url)),
        garage: fileURLToPath(new URL('./garage-map.html', import.meta.url)),
      },
    },
  },
})
