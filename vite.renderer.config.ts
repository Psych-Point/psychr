import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'


// Renderer-only Vite config for browser preview and GitHub Pages deployment
export default defineConfig({
  plugins: [react()],
  root: '.',
  // Use /psychr/ base when deploying to GitHub Pages
  base: process.env.GITHUB_ACTIONS ? '/psychr/' : '/',
  build: {
    outDir: 'out/renderer',
  },
})

