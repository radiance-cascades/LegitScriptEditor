import { defineConfig } from 'vite'

export default defineConfig({
  base: '/LegitScriptEditor/',
  build: {
    outDir: 'dist/prod',
    assetsDir: 'assets',
    minify: 'terser',
    rollupOptions: {
    }
  }
});
