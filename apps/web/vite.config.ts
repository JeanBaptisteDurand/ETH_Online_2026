import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  // Sert sous /hooks/ sur GitHub Pages, a la racine en local.
  base: process.env.BASE_URL ?? "/",
  plugins: [react(), tailwindcss()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
})
