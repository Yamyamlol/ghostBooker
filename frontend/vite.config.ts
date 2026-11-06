import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Forward API calls to the backend so the browser sees one origin (no CORS needed)
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
})
