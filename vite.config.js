import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    // ponytail: every phone that can run a PWA supports es2020. Shipping ES5
    // transforms + polyfills to them is pure dead weight.
    target: 'es2020',
    sourcemap: false,
    cssCodeSplit: true,
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        // React barely changes; App.jsx changes every deploy. Splitting them means
        // a deploy only invalidates the app chunk, not the 140KB of runtime.
        manualChunks: { react: ['react', 'react-dom', 'react-dom/client'] },
      },
    },
  },
})
